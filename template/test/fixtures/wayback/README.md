# Recorded Wayback Machine responses

Real responses from the Internet Archive's public APIs, recorded on 2026-11-18 so the
`WaybackHistorySource` tests run offline against the real response format:

- `cdx-example-com.json`: the CDX capture list for `example.com/`, one capture per year
  (`collapse=timestamp:4&limit=-3`).
- `example-com-<timestamp>.html`: the original bytes of each capture (`/web/<timestamp>id_/<url>`).

`example.com` is IANA's documentation domain. Its wording changed between these captures, which
gives the timeline tests a real change to find.
