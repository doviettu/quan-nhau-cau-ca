"""Chạy giọng VieNeu-TTS cho app Cậu Cả Live.

ONNX Runtime bản mới chặn mô hình có dữ liệu ngoài (.data) khi file nằm trong
bộ nhớ đệm Hugging Face (file là symlink trỏ sang các thư mục blobs khác nhau →
lỗi "External data path escapes model directory"). Ở đây mọi lượt tải của
VieNeu được chuyển sang tải vào thư mục thường (local_dir, file thật), nên
.onnx và .data nằm cùng một chỗ.

    python vieneu_run.py            # chạy máy chủ (OpenAI speech API)
    python vieneu_run.py --warmup   # tải mô hình + đọc thử một câu
Biến môi trường: CAUCA_VIENEU_MODELS = thư mục chứa mô hình.
"""
import os
import sys

import huggingface_hub

MODELS = os.environ.get("CAUCA_VIENEU_MODELS") or os.path.join(
    os.path.expanduser("~"), "Library", "Application Support", "CauCaLive", "vieneu", "models")
_orig_download = huggingface_hub.hf_hub_download


def _download(repo_id=None, filename=None, *args, **kw):
    repo = repo_id if repo_id is not None else kw.get("repo_id")
    if repo and not kw.get("local_dir") and not os.path.isdir(str(repo)):
        kw["local_dir"] = os.path.join(MODELS, str(repo).replace("/", "__"))
    if repo_id is None:
        return _orig_download(filename=filename, *args, **kw) if filename is not None else _orig_download(*args, **kw)
    return _orig_download(repo_id, filename, *args, **kw)


huggingface_hub.hf_hub_download = _download
try:  # một số chỗ import thẳng từ module con
    import huggingface_hub.file_download as _fd
    _fd.hf_hub_download = _download
except Exception:
    pass


def main():
    os.makedirs(MODELS, exist_ok=True)
    if sys.argv[1:2] == ["--warmup"]:
        from vieneu import Vieneu
        tts = Vieneu(mode="v3turbo", backend="onnx")
        for _ in tts.infer_stream("Xin chào cả nhà, Cậu Cả đây!", apply_watermark=False):
            pass
        print("OK")
        return
    from apps.openai_speech import main as serve
    serve()


if __name__ == "__main__":
    main()
