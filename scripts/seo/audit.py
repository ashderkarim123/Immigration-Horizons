"""Read-only audit of sitemap pages. Uses Python's standard library only."""
import argparse
import concurrent.futures
import datetime
import html.parser
import json
import pathlib
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


class Page(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ''
        self.in_title = False
        self.meta = {}
        self.canonicals = []
        self.h1_count = 0
        self.images_missing_alt = 0
        self.schemas = []
        self.in_schema = False
        self.schema = ''
        self.links = set()
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'title':
            self.in_title = True
        if tag == 'h1':
            self.h1_count += 1
        if tag == 'meta':
            self.meta[a.get('name', a.get('property', ''))] = a.get('content', '')
        if tag == 'link' and a.get('rel') == 'canonical':
            self.canonicals.append(a.get('href', ''))
        if tag == 'img' and 'alt' not in a:
            self.images_missing_alt += 1
        if tag == 'a' and a.get('href'):
            self.links.add(a['href'])
        if tag == 'script':
            self.scripts.append(a.get('src', ''))
            self.in_schema = a.get('type') == 'application/ld+json'
            self.schema = ''

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.in_schema:
            self.schema += data

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        if tag == 'script' and self.in_schema:
            try:
                self.schemas.append(json.loads(self.schema))
            except json.JSONDecodeError:
                self.schemas.append({'invalid_json': True})
            self.in_schema = False


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'ImmigrationHorizons-SEO-Audit/1.0'})
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            return response.status, response.url, dict(response.headers), response.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as error:
        return error.code, error.url, dict(error.headers), ''


def inspect(url):
    try:
        status, final, headers, body = fetch(url)
        page = Page()
        page.feed(body)
        issues = []
        if status != 200:
            issues.append(f'HTTP {status}')
        if not page.title:
            issues.append('Missing title')
        warnings = []
        if len(page.title) > 65:
            warnings.append('Long title: review for snippet truncation (not a ranking limit)')
        if len(page.meta.get('description', '')) > 175:
            warnings.append('Long description: review for snippet truncation (Google may rewrite it)')
        if not page.meta.get('description'):
            issues.append('Missing description')
        if len(page.canonicals) != 1:
            issues.append('Expected one canonical')
        elif page.canonicals[0].rstrip('/') != final.rstrip('/'):
            issues.append('Canonical differs from final URL')
        if page.h1_count != 1:
            issues.append(f'H1 count: {page.h1_count}')
        if page.images_missing_alt:
            issues.append(f'Images missing alt: {page.images_missing_alt}')
        if not page.meta.get('og:image'):
            issues.append('Missing Open Graph image')
        if not page.meta.get('twitter:card'):
            issues.append('Missing Twitter card')
        if any(s.get('invalid_json') for s in page.schemas if isinstance(s, dict)):
            issues.append('Invalid JSON-LD')
        if 'noindex' in (page.meta.get('robots', '') + headers.get('X-Robots-Tag', '')):
            issues.append('Sitemap page is noindex')
        return {'url': url, 'final_url': final, 'status': status, 'title': page.title,
                'description': page.meta.get('description'), 'canonical': page.canonicals,
                'h1_count': page.h1_count, 'schema_count': len(page.schemas),
                'html_bytes': len(body.encode()), 'issues': issues, 'warnings': warnings,
                'internal_links': sorted(urllib.parse.urljoin(final, link).split('#')[0]
                                         for link in page.links if link.startswith('/') or link.startswith(final.split('/')[0] + '//' + urllib.parse.urlparse(final).netloc))}
    except (OSError, ValueError) as error:
        return {'url': url, 'issues': [f'Fetch failed: {type(error).__name__}']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', default='https://immigrationhorizons.com')
    parser.add_argument('--output', default='validation/seo-live-audit.json')
    args = parser.parse_args()
    origin = args.origin.rstrip('/')
    robots_status, _, _, robots = fetch(origin + '/robots.txt')
    sitemap_status, _, _, xml = fetch(origin + '/sitemap.xml')
    tree = ET.fromstring(xml)
    urls = [n.text for n in tree.findall('.//{*}loc') if n.text]
    if any(urllib.parse.urlparse(url).netloc != urllib.parse.urlparse(origin).netloc for url in urls):
        raise ValueError('Sitemap contains a different host; review before crawling')
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        pages = list(pool.map(inspect, urls))
    # Check all public internal link targets once, without query parameters.
    targets = sorted({link.split('?')[0] for page in pages for link in page.get('internal_links', [])})
    extra = [url for url in targets if url not in urls and not any(part in urllib.parse.urlparse(url).path.split('/') for part in ['api', 'portal', 'staff'])]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        linked_pages = list(pool.map(inspect, extra))
    report = {'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'origin': origin, 'robots_status': robots_status, 'robots': robots,
              'sitemap_status': sitemap_status, 'sitemap_page_count': len(urls),
              'pages': pages, 'extra_link_targets': linked_pages,
              'limitations': ['HTML audit only; not a Google indexing verdict, rendered-browser tag audit, Lighthouse or Core Web Vitals report.']}
    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(f'{len(pages)} sitemap pages; {sum(bool(p["issues"]) for p in pages)} pages with errors; '
          f'{sum(bool(p.get("warnings")) for p in pages)} pages with snippet warnings. Report: {output}')


if __name__ == '__main__':
    main()
