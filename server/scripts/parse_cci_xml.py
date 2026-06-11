#!/usr/bin/env python3
"""
Convert the official DISA CCI list (U_CCI_List.xml) into the JSON format
used by this app's server/data/cci-mapping.json.

Get the source file:
  https://public.cyber.mil  ->  STIGs  ->  CCI  ->  U_CCI_List.xml
  (CAC login required)

Usage:
  python3 parse_cci_xml.py /path/to/U_CCI_List.xml > ../data/cci-mapping.json

Output format:
  {
    "AC-2": ["CCI-000015", "CCI-000016", ...],
    "AC-2(1)": ["CCI-001683"],
    ...
  }

Notes:
- The CCI XML maps each CCI to a NIST 800-53 control "index" (e.g. AC-2.a,
  AC-2(1)). This script strips the trailing sub-part letter (".a", ".b", etc.)
  so all CCIs for a control's sub-parts are grouped under the base control ID
  -- matching the granularity used by this app's eMASS rollup (one row per
  base control).
- If you want sub-part-level granularity instead, remove the regex strip
  below and adjust App.jsx's CCI rollup accordingly.
"""

import sys
import json
import re
import xml.etree.ElementTree as ET

if len(sys.argv) != 2:
    print(__doc__)
    sys.exit(1)

tree = ET.parse(sys.argv[1])
root = tree.getroot()

# The CCI XML uses a namespace; find it dynamically
ns = ""
if root.tag.startswith("{"):
    ns = root.tag.split("}")[0] + "}"

mapping = {}

for cci_item in root.iter(f"{ns}cci_item"):
    cci_id = cci_item.get("id")  # e.g. "CCI-000015"
    if not cci_id:
        continue
    for ref in cci_item.iter(f"{ns}reference"):
        index = ref.get("index", "")  # e.g. "AC-2.a" or "AC-2(1)"
        if not index:
            continue
        # Strip trailing ".x" sub-part lettering -> group at base/enhancement level
        m = re.match(r"^([A-Z]{2}-\d+(?:\(\d+\))?)", index)
        if not m:
            continue
        control_id = m.group(1).upper()
        mapping.setdefault(control_id, [])
        if cci_id not in mapping[control_id]:
            mapping[control_id].append(cci_id)

# Sort CCI lists for determinism
for k in mapping:
    mapping[k].sort()

print(json.dumps(mapping, indent=2))
print(f"Mapped {len(mapping)} controls/enhancements", file=sys.stderr)
