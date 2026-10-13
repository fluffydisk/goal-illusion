import hashlib
import json

import pytest

from scripts.build_service_worker import build


def assets(tmp_path):
    (tmp_path / 'data').mkdir()
    for name in ['index.html', 'style.css', 'icon.svg', 'icon-192.png', 'icon-512.png',
                 'manifest.webmanifest', 'data/site.json', 'statsbomb-logo.png',
                 'data/STATSBOMB_LICENSE.pdf', 'app.mjs']:
        (tmp_path / name).write_bytes(name.encode())
    (tmp_path / 'data/analysis.json').write_text(json.dumps({
        'source_updated_at': '2026-10-13', 'snapshot': {'updated_at': '2026-10-13'}
    }))
    return tmp_path


def test_fingerprints_include_data_modules_and_install_icons(tmp_path):
    directory = assets(tmp_path)
    version = build(directory)
    source = (directory / 'sw.js').read_text()
    assert version in source
    for name in ['app.mjs', 'data/analysis.json', 'icon-192.png', 'icon-512.png']:
        assert name in source
        assert hashlib.sha256((directory / name).read_bytes()).hexdigest() in source
    assert build(directory) == version
    (directory / 'style.css').write_text('changed')
    assert build(directory) != version


@pytest.mark.parametrize('bundle', [{}, {'source_updated_at': 'old',
                                        'snapshot': {'updated_at': 'new'}}])
def test_incoherent_or_missing_snapshot_preserves_previous_worker(tmp_path, bundle):
    directory = assets(tmp_path)
    build(directory)
    previous = (directory / 'sw.js').read_bytes()
    (directory / 'data/analysis.json').write_text(json.dumps(bundle))
    with pytest.raises(ValueError, match='mixed data'):
        build(directory)
    assert (directory / 'sw.js').read_bytes() == previous
