# 用途：安全解压线上资源备份，并修正 Windows 不支持的文件名。
import json
import os
import shutil
import sys
import tarfile


def clean_part(part: str) -> str:
    cleaned = part.rstrip(" .")
    for character in ':*?\"<>|':
        cleaned = cleaned.replace(character, '_')
    return cleaned


def main() -> None:
    archive_path = os.path.abspath(sys.argv[1])
    destination = os.path.abspath(sys.argv[2])
    fixed = []
    skipped = []
    file_count = 0

    with tarfile.open(archive_path, 'r:gz') as bundle:
        for member in bundle:
            original = member.name
            normalized = original.replace('\\', '/').replace('\r', '').replace('\x00', '').strip('/')
            parts = []
            for part in normalized.split('/'):
                cleaned = clean_part(part)
                if cleaned in ('', '.', '..'):
                    continue
                parts.append(cleaned)

            if not parts:
                skipped.append(original)
                continue

            relative_path = os.path.join(*parts)
            target_path = os.path.abspath(os.path.join(destination, relative_path))
            if os.path.commonpath([destination, target_path]) != destination:
                skipped.append(original)
                continue

            normalized_name = '/'.join(parts)
            if original != normalized_name:
                fixed.append({'from': original, 'to': normalized_name})

            if member.isdir():
                os.makedirs(target_path, exist_ok=True)
                continue
            if not member.isfile():
                skipped.append(original)
                continue

            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            source = bundle.extractfile(member)
            if source is None:
                skipped.append(original)
                continue
            with source, open(target_path, 'wb') as output:
                shutil.copyfileobj(source, output)
            file_count += 1

    print(json.dumps({
        'files': file_count,
        'fixed': fixed,
        'skipped': skipped,
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
