---
name: test-synthesizer
description: >-
  Use when analyzing a PR for test coverage gaps and automatically synthesizing missing unit
  and integration tests — identifies uncovered modified symbols, prioritizes by risk, and
  writes idiomatic tests using the project's existing test framework.
---

# Test Synthesizer Skill

Identify every modified or added symbol in the PR that lacks test coverage, then synthesize
complete, idiomatic tests for each one. This skill is the ONLY agent permitted to create new
source files (test files only).

---

## Step 1 — Load Context

1. Read `.bobrules` for test output requirements.
2. Read `AGENTS.md` for service-to-language mapping.
3. Identify all changed source files from the orchestrator or via:
```bash
git diff origin/main...HEAD --name-only -- '*.ts' '*.js' '*.py' '*.go'
```

---

## Step 2 — Detect Test Framework

For each service, detect the test framework in use:

**Node.js/TypeScript:**
```bash
cat package.json | grep -E '"jest"|"vitest"|"mocha"' 2>/dev/null
ls **/*.test.ts **/*.spec.ts __tests__/ 2>/dev/null | head -5
```

**Python:**
```bash
cat pyproject.toml setup.cfg pytest.ini 2>/dev/null | grep -E "pytest|unittest"
ls tests/ test_*.py *_test.py 2>/dev/null | head -5
```

**Go:**
```bash
ls **/*_test.go 2>/dev/null | head -5
```

Read one existing test file per service to extract:
- Import/require patterns
- Test naming conventions (`describe/it`, `test()`, `def test_`, `func Test`)
- Mock/stub patterns (jest.mock, unittest.mock, testify/mock)
- Assertion library (expect/assert)
- Test file naming convention and placement

---

## Step 3 — Extract Modified Symbols

For each changed source file, use `read_file` with the specific line ranges of changes (from
git diff hunk headers `@@ -X,Y +A,B @@`) to read the modified functions/classes.

For each modified region, extract:
- Symbol name (function, method, class, handler)
- Input parameters and types
- Return type
- Observable side effects (DB write, HTTP call, file I/O, event emit)
- Error conditions and boundary cases visible in the code

---

## Step 4 — Cross-Reference Existing Tests

For each extracted symbol, search for existing tests:
```bash
grep -r "symbolName" tests/ __tests__/ src/ --include="*.test.*" --include="*.spec.*" -l 2>/dev/null
grep -r "def test_symbolName\|test symbolName\|TestSymbolName" tests/ -l 2>/dev/null
```

If a symbol is already tested, skip it. Only synthesize tests for genuinely uncovered symbols.

---

## Step 5 — Risk-Prioritize Coverage Gaps

Assign risk levels to uncovered symbols:

| Risk Level | Criteria |
|-----------|----------|
| **Critical** | Authentication, authorization, token validation, password handling |
| **High** | Database writes, external API calls, data validation, financial calculations |
| **Medium** | Data transformation, business logic, event handlers |
| **Low** | Utility functions, formatters, pure functions with no side effects |

Synthesize tests in order: Critical → High → Medium → Low.

---

## Step 6 — Write Coverage Gap Report

Before synthesizing any tests, write `reports/coverage-gaps.json`:

```json
{
  "timestamp": "",
  "total_modified_symbols": 0,
  "uncovered_count": 0,
  "uncovered_symbols": [
    {
      "file": "src/auth/tokenValidator.ts",
      "symbol_name": "validateJWT",
      "symbol_type": "function",
      "risk_level": "critical",
      "reason": "Handles JWT validation — no existing test found",
      "test_file_planned": "__tests__/auth/tokenValidator.test.ts",
      "test_file_generated": false
    }
  ],
  "tests_generated": [],
  "coverage_delta_estimate": "+12%"
}
```

---

## Step 7 — Synthesize Test Files

For each uncovered symbol (Critical and High risk first), synthesize a complete test file.

### Test Structure Requirements

Every synthesized test MUST include:

1. **Happy path test** — valid inputs, expected successful output
2. **Edge case test** — boundary values (empty string, zero, max int, empty array, null)
3. **Error/failure test** — invalid input, expected error thrown/returned

### Node.js/TypeScript (Jest) Template

```typescript
import { symbolName } from '../relative/path/to/source';

// Mock any external dependencies
jest.mock('../deps/externalService');

describe('symbolName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should [expected behavior] when [valid input]', async () => {
    // Arrange
    const input = /* realistic test value */;
    // Act
    const result = await symbolName(input);
    // Assert
    expect(result).toEqual(/* expected */);
  });

  it('should handle edge case: [edge case description]', async () => {
    const result = await symbolName(/* edge input */);
    expect(result).toBeDefined();
  });

  it('should throw [ErrorType] when [invalid condition]', async () => {
    await expect(symbolName(/* invalid input */)).rejects.toThrow('[error message]');
  });
});
```

### Python (pytest) Template

```python
import pytest
from unittest.mock import MagicMock, patch
from path.to.module import symbol_name

class TestSymbolName:
    def test_happy_path(self):
        # Arrange
        input_val = ...
        # Act
        result = symbol_name(input_val)
        # Assert
        assert result == expected

    def test_edge_case_empty_input(self):
        result = symbol_name("")
        assert result is not None

    def test_raises_value_error_on_invalid_input(self):
        with pytest.raises(ValueError, match="expected error message"):
            symbol_name(None)
```

### Go (testing + testify) Template

```go
package packagename_test

import (
    "testing"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
    "path/to/package"
)

func TestSymbolName_HappyPath(t *testing.T) {
    result, err := packagename.SymbolName(validInput)
    require.NoError(t, err)
    assert.Equal(t, expected, result)
}

func TestSymbolName_EdgeCase_Empty(t *testing.T) {
    result, err := packagename.SymbolName("")
    assert.NoError(t, err)
    assert.NotNil(t, result)
}

func TestSymbolName_ErrorOnInvalidInput(t *testing.T) {
    _, err := packagename.SymbolName(nil)
    assert.ErrorIs(t, err, packagename.ErrInvalidInput)
}
```

CRITICAL RULE: Every assertion must be grounded in the actual function signature and behavior
visible in the source code. Never hallucinate return values or error types not present in the code.

---

## Step 8 — Update Coverage Gap Report

After writing each test file, update `reports/coverage-gaps.json`:
- Set `test_file_generated: true` for each synthesized symbol
- Populate `tests_generated` array with the file paths created
- Update `coverage_delta_estimate` based on number of symbols now covered

Use `write_file` (not `insert_content`) to update the full JSON atomically.

---

## Step 9 — Output Summary

Report:
- Total modified symbols scanned
- Number of coverage gaps found
- Number of tests synthesized (by risk level)
- List of new test files created
- Estimated coverage delta
- Any symbols that could NOT be tested automatically (with reason)
