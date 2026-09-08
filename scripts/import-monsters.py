"""Package downloaded Quaternius glTF files and their atlas into local GLB files.

Usage: python3 scripts/import-monsters.py /path/to/download-directory
Expected input: td-{goblin,ogre,wraith,atlas,license}.download.
Source model IDs and license are documented in ASSETS.md.
"""
import base64
import json
import pathlib
import struct
import sys

source = pathlib.Path(sys.argv[1])
target = pathlib.Path(__file__).resolve().parents[1] / 'gameclient/public/assets/monsters'
target.mkdir(parents=True, exist_ok=True)
for name in ['goblin', 'ogre', 'wraith']:
    doc = json.loads((source / f'td-{name}.download').read_text())
    binary = bytearray()
    offsets = []
    for buffer in doc['buffers']:
        offsets.append(len(binary))
        uri = buffer['uri']
        if not uri.startswith('data:'):
            raise ValueError('Expected an embedded buffer')
        binary.extend(base64.b64decode(uri.split(',', 1)[1]))
        binary.extend(b'\0' * (-len(binary) % 4))
    for view in doc['bufferViews']:
        view['byteOffset'] = view.get('byteOffset', 0) + offsets[view['buffer']]
        view['buffer'] = 0
    for image in doc.get('images', []):
        uri = image.pop('uri', None)
        if uri:
            data = base64.b64decode(uri.split(',', 1)[1]) if uri.startswith('data:') else (source / 'td-atlas.download').read_bytes()
            image['bufferView'] = len(doc['bufferViews'])
            image['mimeType'] = 'image/png'
            doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)})
            binary.extend(data)
            binary.extend(b'\0' * (-len(binary) % 4))
    doc['buffers'] = [{'byteLength': len(binary)}]
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(encoded) + 8 + len(binary))
    glb += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    glb += struct.pack('<II', len(binary), 0x004E4942) + binary
    (target / f'{name}.glb').write_bytes(glb)
    print(f'{name}.glb: {len(glb):,} bytes, {len(doc.get("animations", []))} animations')
(target / 'License.txt').write_bytes((source / 'td-license.download').read_bytes())
