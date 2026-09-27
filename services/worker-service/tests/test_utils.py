"""
Tests for sanitize_filename (extended) and calculate_priority_score.
"""
import pytest
from src.main import sanitize_filename, calculate_priority_score


class TestSanitizeFilenameExtended:
    """Additional coverage beyond the basic happy path in test_sanitize.py."""

    # --- Path traversal prevention ---
    def test_strips_directory_traversal(self):
        assert sanitize_filename("../../etc/passwd") == "passwd"

    def test_strips_absolute_path(self):
        assert sanitize_filename("/etc/passwd") == "passwd"

    def test_strips_windows_path_separator(self):
        result = sanitize_filename("C:\\Windows\\system32\\file.txt")
        # os.path.basename on non-Windows returns the whole string after last '/'
        # but the re.sub will replace backslashes, colons, etc.
        assert ".." not in result
        assert "/" not in result
        assert "\\" not in result

    def test_strips_nested_path(self):
        result = sanitize_filename("subdir/subdir2/report.pdf")
        assert result == "report.pdf"

    # --- Special character sanitization ---
    def test_replaces_spaces_with_underscore(self):
        result = sanitize_filename("my report.pdf")
        assert result == "my_report.pdf"

    def test_replaces_semicolons(self):
        result = sanitize_filename("file;rm -rf.txt")
        assert ";" not in result
        assert " " not in result

    def test_preserves_allowed_chars(self):
        assert sanitize_filename("file_name-v1.2.tar.gz") == "file_name-v1.2.tar.gz"

    # --- Invalid input raises ValueError ---
    def test_raises_for_empty_string(self):
        with pytest.raises(ValueError, match="Invalid filename"):
            sanitize_filename("")

    def test_raises_for_dot_only_filename(self):
        with pytest.raises(ValueError, match="Invalid filename"):
            sanitize_filename(".")

    def test_raises_for_dotdot_filename(self):
        with pytest.raises(ValueError, match="Invalid filename"):
            sanitize_filename("..")

    def test_raises_for_hidden_dot_file(self):
        # After sanitization basename starts with '.' — should be rejected
        with pytest.raises(ValueError, match="Invalid filename"):
            sanitize_filename(".hidden")

    def test_raises_for_path_that_resolves_to_dot_start(self):
        with pytest.raises(ValueError, match="Invalid filename"):
            sanitize_filename("/tmp/.secret")

    def test_special_chars_replaced_with_underscores(self):
        # @@@### → all replaced with underscores → "______" which is a valid safe name
        result = sanitize_filename("@@@###")
        assert result == "______"


class TestCalculatePriorityScore:
    # --- Happy path ---
    def test_non_vip_no_size_penalty(self):
        score = calculate_priority_score(urgency=5, size_bytes=0, vip=False)
        assert score == 50.0

    def test_vip_adds_15_bonus(self):
        score = calculate_priority_score(urgency=5, size_bytes=0, vip=True)
        assert score == 65.0

    def test_size_penalty_capped_at_20(self):
        # 100 MB → size_penalty = min(100, 20) = 20
        score = calculate_priority_score(urgency=10, size_bytes=100_000_000, vip=False)
        assert score == 80.0  # 100 - 20 + 0

    def test_score_capped_at_100(self):
        # urgency=10, vip=True, no size penalty → 100+15=115 → capped at 100
        score = calculate_priority_score(urgency=10, size_bytes=0, vip=True)
        assert score == 100.0

    def test_minimum_urgency(self):
        score = calculate_priority_score(urgency=1, size_bytes=0, vip=False)
        assert score == 10.0

    def test_maximum_urgency_no_vip(self):
        score = calculate_priority_score(urgency=10, size_bytes=0, vip=False)
        assert score == 100.0

    def test_partial_size_penalty(self):
        # 500 KB → 0.5 MB → penalty = 0.5
        score = calculate_priority_score(urgency=5, size_bytes=500_000, vip=False)
        assert score == round(50.0 - 0.5, 2)

    def test_return_type_is_float(self):
        score = calculate_priority_score(urgency=3, size_bytes=0, vip=False)
        assert isinstance(score, float)

    # --- Edge cases ---
    def test_zero_size_bytes_allowed(self):
        score = calculate_priority_score(urgency=5, size_bytes=0, vip=False)
        assert score == 50.0

    def test_vip_false_gives_no_bonus(self):
        non_vip = calculate_priority_score(urgency=7, size_bytes=0, vip=False)
        vip = calculate_priority_score(urgency=7, size_bytes=0, vip=True)
        assert vip - non_vip == 15.0

    # --- Error conditions ---
    def test_raises_for_urgency_zero(self):
        with pytest.raises(ValueError, match="urgency must be 1"):
            calculate_priority_score(urgency=0, size_bytes=0, vip=False)

    def test_raises_for_urgency_eleven(self):
        with pytest.raises(ValueError, match="urgency must be 1"):
            calculate_priority_score(urgency=11, size_bytes=0, vip=False)

    def test_raises_for_negative_size_bytes(self):
        with pytest.raises(ValueError, match="size_bytes cannot be negative"):
            calculate_priority_score(urgency=5, size_bytes=-1, vip=False)
