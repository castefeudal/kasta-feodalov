#!/usr/bin/env python3
"""Optional packaging; the website never needs a build to run.

Creates the standalone HTML and full ZIP beside the project directory.
--site-url also configures real, absolute SEO metadata before packaging.
Only the Python standard library is required.
"""
from __future__ import annotations
import argparse
import base64
import datetime
import html as html_module
import json
import mimetypes
from pathlib import Path
import re
from urllib.parse import urljoin, urlsplit
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT.parent
SINGLE_FILE = PARENT / 'kasta-feodalov.html'
ARCHIVE = PARENT / 'kasta-feodalov.zip'
EXCLUDED_DIRS = {'node_modules', '__pycache__', '.git', '.cache', '.pytest_cache'}


def data_uri(file: Path) -> str:
    resolved = file.resolve()
    if not resolved.is_relative_to(ROOT):
        raise ValueError(f'Asset outside the project: {file}')
    if not resolved.is_file():
        raise FileNotFoundError(resolved)
    mime = mimetypes.guess_type(resolved.name)[0] or 'application/octet-stream'
    encoded = base64.b64encode(resolved.read_bytes()).decode('ascii')
    return f'data:{mime};base64,{encoded}'


def configure_site_url(document: str, site_url: str) -> str:
    parsed = urlsplit(site_url)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or
            parsed.password or parsed.query or parsed.fragment or
            any(char in site_url for char in '<>"\'\n\r\t ')):
        raise ValueError('Provide a real HTTPS site URL without credentials, query or fragment.')
    site_url = site_url.rstrip('/') + '/'
    canonical = html_module.escape(site_url, quote=True)
    document = re.sub(r'\s*<link\b[^>]*rel="canonical"[^>]*>', '', document)
    document = re.sub(r'\s*<meta\b[^>]*property="og:url"[^>]*>', '', document)
    document = document.replace('</head>', f'  <link rel="canonical" href="{canonical}">\n  <meta property="og:url" content="{canonical}">\n</head>')
    cover = urljoin(site_url, 'assets/images/og-cover.jpg')
    document = re.sub(r'(<meta property="og:image" content=")[^"]*(">)', lambda m: m[1] + cover + m[2], document)
    schema_pattern = r'(<script type="application/ld\+json">)(.*?)(</script>)'
    def update_schema(match: re.Match) -> str:
        schema = json.loads(match[2])
        schema['url'] = site_url
        schema['logo'] = urljoin(site_url, 'assets/icons/crest.svg')
        return match[1] + '\n  ' + json.dumps(schema, ensure_ascii=False, separators=(',', ':')) + '\n  ' + match[3]
    document = re.sub(schema_pattern, update_schema, document, flags=re.S)
    (ROOT / 'index.html').write_text(document, encoding='utf-8')
    modified = datetime.datetime.fromtimestamp((ROOT / 'index.html').stat().st_mtime, datetime.timezone.utc).date().isoformat()
    sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
               f'  <url><loc>{html_module.escape(site_url)}</loc><lastmod>{modified}</lastmod></url>\n'
               '</urlset>\n')
    (ROOT / 'sitemap.xml').write_text(sitemap, encoding='utf-8')
    robots = (ROOT / 'robots.txt').read_text(encoding='utf-8')
    robots = re.sub(r'^Sitemap:.*\n?', '', robots, flags=re.M).rstrip()
    (ROOT / 'robots.txt').write_text(robots + '\n\nSitemap: ' + urljoin(site_url, 'sitemap.xml') + '\n', encoding='utf-8')
    return document


def inline_css(css_file: Path) -> str:
    css = css_file.read_text(encoding='utf-8')
    def replace_url(match: re.Match) -> str:
        value = match[2]
        if value.startswith(('data:', '#', 'https:', 'http:')):
            return match[0]
        return 'url("' + data_uri(css_file.parent / value) + '")'
    return re.sub(r'url\(([\'"]?)(.*?)\1\)', replace_url, css)


def make_standalone(document: str) -> str:
    document = re.sub(r'\s*<link\b[^>]*rel="preload"[^>]*>', '', document)
    def replace_stylesheet(match: re.Match) -> str:
        return '<style>\n' + inline_css(ROOT / match[1]) + '\n</style>'
    document = re.sub(r'<link rel="stylesheet" href="([^"]+)">', replace_stylesheet, document)
    scripts = []
    def collect_script(match: re.Match) -> str:
        scripts.append((ROOT / match[1]).read_text(encoding='utf-8'))
        return ''
    document = re.sub(r'<script src="([^"]+)" defer></script>', collect_script, document)
    # These attributes contain one local asset each in this site's source.
    def replace_asset(match: re.Match) -> str:
        return match[1] + '="' + data_uri(ROOT / match[2]) + '"'
    document = re.sub(r'\b(src|srcset|href|content)="(assets/[^"]+)"', replace_asset, document)
    # JSON-LD logo does not trigger a request, but embed it for a complete local file.
    document = document.replace('"logo":"assets/icons/crest.svg"', '"logo":' + json.dumps(data_uri(ROOT / 'assets/icons/crest.svg')))
    document = document.replace('</body>', '<script>\n' + '\n'.join(scripts) + '\n</script>\n</body>')
    return document


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-url', help='Verified HTTPS deployment URL. Also updates canonical, Open Graph and sitemap.')
    args = parser.parse_args()
    source = (ROOT / 'index.html').read_text(encoding='utf-8')
    if args.site_url:
        source = configure_site_url(source, args.site_url)
    standalone = make_standalone(source)
    SINGLE_FILE.write_text(standalone, encoding='utf-8')
    with ZipFile(ARCHIVE, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for file in sorted(ROOT.rglob('*')):
            relative = file.relative_to(ROOT)
            if not file.is_file() or any(part in EXCLUDED_DIRS for part in relative.parts):
                continue
            if file.name in {'package-lock.json', '.DS_Store'}:
                continue
            archive.write(file, Path(ROOT.name) / relative)
        archive.write(SINGLE_FILE, SINGLE_FILE.name)
    print(f'Standalone: {SINGLE_FILE} ({SINGLE_FILE.stat().st_size:,} bytes)')
    print(f'Archive:    {ARCHIVE} ({ARCHIVE.stat().st_size:,} bytes)')
    print('Source site is ready to open directly or serve; no build is required.')


if __name__ == '__main__':
    main()
