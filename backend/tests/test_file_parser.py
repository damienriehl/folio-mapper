from pathlib import Path

from app.services.file_parser import parse_file


def test_parse_flat_csv(fixtures_dir: Path):
    content = (fixtures_dir / "flat.csv").read_bytes()
    result = parse_file(content, "flat.csv")
    assert result.format == "flat"
    assert result.total_items == 6
    assert result.items[0].text == "Contract Law"
    assert result.items[5].text == "Administrative Law"
    assert result.source_filename == "flat.csv"


def test_parse_hierarchical_csv(fixtures_dir: Path):
    content = (fixtures_dir / "hierarchical.csv").read_bytes()
    result = parse_file(content, "hierarchical.csv")
    assert result.format == "hierarchical"
    assert result.hierarchy is not None
    assert len(result.hierarchy) == 2  # Litigation + Transactional
    assert result.hierarchy[0].label == "Litigation"
    assert result.hierarchy[1].label == "Transactional"
    # Leaf nodes
    leaf_texts = [item.text for item in result.items]
    assert "Securities" in leaf_texts
    assert "Consumer Protection" in leaf_texts
    assert "Due Diligence" in leaf_texts


def test_parse_csv_with_header(fixtures_dir: Path):
    content = (fixtures_dir / "flat_with_header.csv").read_bytes()
    result = parse_file(content, "flat_with_header.csv")
    assert result.format == "flat"
    assert result.headers == ["Practice Area", "Description"]
    assert result.total_items == 3
    assert result.items[0].text == "Contract Law"


def test_parse_text_file():
    content = b"Contract Law\nTort Law\nProperty Law"
    result = parse_file(content, "items.txt")
    assert result.format == "flat"
    assert result.total_items == 3


def test_unsupported_extension():
    try:
        parse_file(b"data", "file.pdf")
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "Unsupported file type" in str(e)


def test_file_too_large():
    content = b"x" * (11 * 1024 * 1024)
    try:
        parse_file(content, "big.csv")
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "too large" in str(e)


def test_parse_tsv():
    content = b"Name\tDescription\nContract Law\tDeals with agreements\nTort Law\tDeals with civil wrongs"
    result = parse_file(content, "items.tsv")
    assert result.format == "flat"
    assert result.headers == ["Name", "Description"]
    assert result.total_items == 2
    assert result.items[0].text == "Contract Law"
