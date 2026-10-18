// Trusted Python that unpacks and previews downloaded data inside the sandbox.
// It runs as an unprivileged user; downloaded files are data, never executed.
export const INSPECT_DATA_PY = String.raw`
import json, os, sys, zipfile, tarfile, gzip, shutil

LIMIT = 6 * 1024 ** 3      # uncompressed bytes per archive
MAX_MEMBERS = 20000
entries = json.loads(sys.argv[1])

def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024

def safe_member(name):
    norm = os.path.normpath(name)
    return not (os.path.isabs(norm) or norm == ".." or norm.startswith(".." + os.sep))

def extract(directory, filename):
    path = os.path.join(directory, filename)
    target = os.path.join(directory, "extracted")
    if os.path.isdir(target):
        return target
    tmp = target + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    lower = filename.lower()
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_MEMBERS or sum(i.file_size for i in infos) > LIMIT:
                raise ValueError("archive is too large to unpack")
            if not all(safe_member(i.filename) for i in infos):
                raise ValueError("archive contains unsafe paths")
            archive.extractall(tmp)
    elif tarfile.is_tarfile(path):
        with tarfile.open(path) as archive:
            members = archive.getmembers()
            if len(members) > MAX_MEMBERS or sum(m.size for m in members) > LIMIT:
                raise ValueError("archive is too large to unpack")
            archive.extractall(tmp, filter="data")
    elif lower.endswith(".gz"):
        os.makedirs(tmp)
        written = 0
        with gzip.open(path, "rb") as source, open(os.path.join(tmp, filename[:-3]), "wb") as sink:
            while True:
                block = source.read(1 << 20)
                if not block:
                    break
                written += len(block)
                if written > LIMIT:
                    raise ValueError("compressed file is too large to unpack")
                sink.write(block)
    else:
        return None
    os.rename(tmp, target)
    return target

def preview(path):
    lower = path.lower()
    try:
        if lower.endswith((".parquet", ".pq")):
            import pyarrow.parquet as pq
            handle = pq.ParquetFile(path)
            schema = handle.schema_arrow
            columns = ", ".join(f"{field.name} ({field.type})" for field in list(schema)[:30])
            more = f" and {len(schema) - 30} more" if len(schema) > 30 else ""
            head = ""
            if handle.num_row_groups:
                import pandas as pd
                with pd.option_context("display.max_columns", 10, "display.width", 160, "display.max_colwidth", 24):
                    head = "\n" + handle.read_row_group(0).slice(0, 3).to_pandas().to_string()
            return f"parquet table, {handle.metadata.num_rows:,} rows, {len(schema)} columns: {columns}{more}{head}"
        if lower.endswith((".csv", ".tsv", ".txt", ".data", ".jsonl")):
            with open(path, "r", errors="replace") as handle:
                lines = [handle.readline()[:240] for _ in range(6)]
            return "first lines:\n" + "".join(line if line.endswith("\n") else line + "\n" for line in lines if line)
        if lower.endswith(".json") and os.path.getsize(path) < 50 * 1024 ** 2:
            with open(path) as handle:
                value = json.load(handle)
            if isinstance(value, dict):
                return "JSON object with keys: " + ", ".join(list(value)[:30])
            if isinstance(value, list):
                return f"JSON list of {len(value)} items; first item: {json.dumps(value[0])[:300] if value else 'none'}"
        if lower.endswith(".npy"):
            import numpy as np
            array = np.load(path, mmap_mode="r", allow_pickle=False)
            return f"numpy array, shape {array.shape}, dtype {array.dtype}"
        if lower.endswith(".npz"):
            import numpy as np
            with np.load(path, allow_pickle=False) as archive:
                return "numpy arrays: " + ", ".join(f"{key} {archive[key].shape} {archive[key].dtype}" for key in list(archive.keys())[:20])
        if lower.endswith(".arff"):
            with open(path, "r", errors="replace") as handle:
                header = []
                for line in handle:
                    header.append(line.rstrip()[:160])
                    if line.strip().lower().startswith("@data") or len(header) > 60:
                        break
            attributes = [line for line in header if line.lower().startswith("@attribute")]
            return f"ARFF file with {len(attributes)} attributes; first: " + "; ".join(attributes[:12])
        if "ubyte" in lower:
            import struct
            with open(path, "rb") as handle:
                magic = struct.unpack(">I", handle.read(4))[0]
                dims = struct.unpack(">" + "I" * (magic & 0xFF), handle.read(4 * (magic & 0xFF)))
            return f"IDX binary array, dimensions {dims}"
        if lower.endswith((".h5", ".hdf5")):
            import h5py
            found = []
            with h5py.File(path, "r") as handle:
                handle.visititems(lambda name, item: found.append(f"{name} {item.shape} {item.dtype}") if hasattr(item, "shape") and len(found) < 20 else None)
            return "HDF5 datasets: " + ", ".join(found)
        if lower.endswith(".mat"):
            from scipy.io import whosmat
            return "MATLAB variables: " + ", ".join(f"{name} {shape} {kind}" for name, shape, kind in whosmat(path)[:20])
    except Exception as error:
        return f"could not preview ({type(error).__name__}: {str(error)[:200]})"
    return None

results = []
for entry in entries:
    directory, filename = entry["dir"], entry["filename"]
    path = os.path.join(directory, filename)
    item = {"key": entry["key"], "bytes": os.path.getsize(path) if os.path.exists(path) else 0, "previews": [], "listing": []}
    try:
        root = extract(directory, filename)
    except Exception as error:
        root = None
        item["error"] = f"could not unpack: {str(error)[:200]}"
    if root:
        item["extracted"] = True
        files = []
        for base, folders, names in os.walk(root):
            folders.sort()
            for name in sorted(names):
                full = os.path.join(base, name)
                files.append((os.path.relpath(full, root), os.path.getsize(full)))
        item["fileCount"] = len(files)
        item["listing"] = [f"{name} ({human(size)})" for name, size in files[:40]]
        shown = 0
        for name, _ in files:
            text = preview(os.path.join(root, name))
            if text:
                item["previews"].append({"path": name, "text": text[:1500]})
                shown += 1
            if shown >= 4:
                break
    else:
        text = preview(path)
        if text:
            item["previews"].append({"path": filename, "text": text[:2000]})
    results.append(item)
print(json.dumps(results))
`;
