/** Fixtures de `.t.py` source para testes. */

export const EMPTY = '';

export const SIMPLE_EMPTY_VAR = `var = []
`;

export const SIMPLE_VAR_WITH_ROWS = `var = [
    {"a": 1, "b": 2},
    {"a": 3, "b": 4},
]
`;

export const VAR_WITH_SENTINEL = `var = []  # tpy:cols=["a","b"]
`;

export const TWO_VARS = `var1 = [
    {"x": 1},
]
var2 = [
    {"y": "hello"},
]
`;

export const WITH_IMPORTS = `import pandas as pd
from datetime import date

dataset = [
    {"date": date(2024, 1, 1), "value": 1},
    {"date": date(2024, 1, 2), "value": 2},
]
`;

export const WITH_DOCSTRING = `"""my module docstring"""

var = [
    {"a": 1},
]
`;

export const WITH_LEADING_COMMENT = `# leading comment
var = [
    {"a": 1},
]
`;
