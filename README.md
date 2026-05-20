# tpy

Edit `.t.py` Python files as interactive spreadsheets — right inside VS Code and Cursor.

`.t.py` files are plain Python files that store tabular data as `list[dict]` assignments. tpy lets you view and edit them visually without touching the source code manually.

## Features

### Spreadsheet view for `.t.py` files

Open any `.t.py` file and click **"Abrir como Planilha"** in the editor title bar to switch to the table view. All edits write back to valid, Black-compatible Python automatically.

### Multiple datasets side by side

Each `list[dict]` variable in your file becomes its own table. Toggle which variables are visible using the pill buttons at the top — you can display one or several at the same time.

### Cell selection and editing

- **Click** a cell to select it (highlighted with an accent outline)
- **Double-click** (or press Enter) to enter edit mode
- **Escape** cancels edits; **Tab / Enter** confirms and moves to the next cell
- **Ctrl+C / Ctrl+V** copies and pastes cells; paste from Excel works too

### Row and column operations

Each variable section has its own mini-toolbar:

| Button | Action |
|--------|--------|
| `+ linha` | Add a row at the end |
| `– linha` | Remove a row (prompts for row number) |
| `+ coluna` | Add a column (prompts for name) |
| `– coluna` | Remove a column |

**Rename a column:** double-click any column header.

### Variable management

Use the global toolbar to:

- `+ var` — create a new variable
- `– var` — delete a variable (with confirmation)
- `renomear var` — rename a variable

### AI-generated files supported

tpy tolerates inline comments inside lists and dicts — common in AI-generated `.t.py` files — without breaking the parser.

### Live diagnostics

Errors in `.t.py` files appear as red squiggles in the text editor, with hover messages and problem panel integration.

### Theme support

tpy follows your VS Code theme automatically. You can also pin it:

```json
"tpy.theme": "auto"   // "auto" | "light" | "dark"
```

## File format

`.t.py` files contain standard Python: imports, module docstrings, and `list[dict]` variable assignments with homogeneous dicts (same keys, same order across all rows):

```python
import pandas as pd
from datetime import date

sales = [
    {"date": date(2024, 1, 1), "region": "SP", "revenue": 1200},
    {"date": date(2024, 1, 2), "region": "RJ", "revenue": 980},
]

targets = [
    {"region": "SP", "goal": 1500},
    {"region": "RJ", "goal": 1000},
]
```

Empty variables preserve their schema via a sentinel comment:

```python
empty = []  # tpy:cols=["col_a","col_b"]
```

tpy produces Black-compatible output — running Black on a saved `.t.py` file is a no-op.

## Requirements

VS Code 1.85 or later (or Cursor).

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `tpy.theme` | `"auto"` | Color theme: `"auto"` follows VS Code, `"light"` or `"dark"` to pin |
