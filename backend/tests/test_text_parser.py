from app.services.text_parser import parse_text


def test_empty_text():
    result = parse_text("")
    assert result.format == "text_single"
    assert result.total_items == 0
    assert result.items == []


def test_single_line():
    result = parse_text("Contract Law")
    assert result.format == "text_single"
    assert result.total_items == 1
    assert result.items[0].text == "Contract Law"


def test_multi_line():
    text = "Contract Law\nTort Law\nProperty Law"
    result = parse_text(text)
    assert result.format == "text_multi"
    assert result.total_items == 3
    assert result.items[0].text == "Contract Law"
    assert result.items[1].text == "Tort Law"
    assert result.items[2].text == "Property Law"


def test_blank_lines_skipped():
    text = "Contract Law\n\n\nTort Law\n  \nProperty Law"
    result = parse_text(text)
    assert result.total_items == 3


def test_whitespace_trimmed():
    text = "  Contract Law  \n  Tort Law  "
    result = parse_text(text)
    assert result.items[0].text == "Contract Law"
    assert result.items[1].text == "Tort Law"


def test_items_indexed():
    text = "A\nB\nC"
    result = parse_text(text)
    assert [item.index for item in result.items] == [0, 1, 2]
