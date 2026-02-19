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


# --- Tab-delimited tests ---


def test_tab_delimited_hierarchical():
    """Excel-paste style: tab-separated columns with blank left cells = hierarchy."""
    text = "Insurance\t\t\n\tFinance\t\n\t\tBorrower\n\t\tLender\n\tHealth\t\nContract Law\t\t\n\tParty A\t"
    result = parse_text(text)
    assert result.format == "hierarchical"
    # All nodes: Insurance, Finance, Borrower, Lender, Health, Contract Law, Party A
    labels = [item.text for item in result.items]
    assert "Insurance" in labels
    assert "Finance" in labels
    assert "Borrower" in labels
    assert "Lender" in labels
    assert "Health" in labels
    assert "Contract Law" in labels
    assert "Party A" in labels
    assert result.total_items == 7
    # Borrower should have ancestry including Insurance > Finance
    borrower = next(item for item in result.items if item.text == "Borrower")
    assert borrower.ancestry == ["Insurance", "Finance"]
    # Insurance is root — no ancestry
    insurance = next(item for item in result.items if item.text == "Insurance")
    assert insurance.ancestry == []


def test_tab_delimited_flat():
    """Tab-delimited data that doesn't form a hierarchy → flat."""
    text = "Name\tAge\tCity\nAlice\t30\tNYC\nBob\t25\tLA\nCarol\t35\tSF"
    result = parse_text(text)
    # Not hierarchical (all rows have multiple non-empty cells)
    assert result.format == "flat"
    assert result.total_items == 3  # 3 data rows (header detected and removed)


def test_plain_text_no_tabs():
    """Plain text without tabs should remain unchanged."""
    text = "Contract Law\nTort Law\nProperty Law"
    result = parse_text(text)
    assert result.format == "text_multi"
    assert result.total_items == 3


def test_tab_only_lines_treated_as_blank():
    """Lines with only tabs should be treated as blank."""
    text = "Hello\n\t\t\t\nWorld"
    result = parse_text(text)
    assert result.format == "text_multi"
    assert result.total_items == 2
    assert result.items[0].text == "Hello"
    assert result.items[1].text == "World"


def test_multi_value_row_expanded():
    """When parent and first child are on the same row, both should appear."""
    text = "Insurance Finance\tBorrower\n\tLender\n\tSecured\nContract\tParty A\n\tParty B"
    result = parse_text(text)
    assert result.format == "hierarchical"
    labels = [item.text for item in result.items]
    # Parent nodes must appear
    assert "Insurance Finance" in labels
    assert "Contract" in labels
    # Child nodes must appear (including same-row children)
    assert "Borrower" in labels
    assert "Lender" in labels
    assert "Secured" in labels
    assert "Party A" in labels
    assert "Party B" in labels
    # Total: 2 parents + 5 children = 7
    assert result.total_items == 7
    # Borrower should be a child of Insurance Finance
    borrower = next(item for item in result.items if item.text == "Borrower")
    assert borrower.ancestry == ["Insurance Finance"]


def test_excel_paste_realistic():
    """Realistic Excel paste with parent+child on same row (the reported bug)."""
    text = (
        "Insurance Finance (non-structured)\tBorrower\n"
        "\tLender\n"
        "\tLetter of Credit\n"
        "\tSecured\n"
        "\tUnsecured\n"
        "Real estate finance (non-securitized)\tCommercial\n"
        "\tGreen, Social and Sustainable Finance\n"
        "\tParticipation\n"
        "\tResidential\n"
        "\tWhole loans\n"
        "Islamic Finance\tIslamic finance\n"
        "Latin America\tLatin America\n"
        "Ship Finance\tBorrower\n"
        "\tLeasing\n"
        "\tLender\n"
        "\tLending\n"
        "\tLessee\n"
        "\tLessor\n"
        "\tRestructuring"
    )
    result = parse_text(text)
    assert result.format == "hierarchical"
    labels = [item.text for item in result.items]
    # Parent nodes must appear
    assert "Insurance Finance (non-structured)" in labels
    assert "Real estate finance (non-securitized)" in labels
    assert "Islamic Finance" in labels
    assert "Ship Finance" in labels
    # Child nodes must NOT be dropped
    assert "Borrower" in labels
    assert "Commercial" in labels
    assert "Lender" in labels
    assert "Islamic finance" in labels
    assert "Latin America" in labels
    assert "Leasing" in labels
    assert "Restructuring" in labels
    # Total: 5 parents + 19 children = 24
    assert result.total_items == 24
    # Verify ancestry for "Borrower" under Insurance Finance
    ins_borrower = next(
        item for item in result.items
        if item.text == "Borrower"
        and "Insurance Finance (non-structured)" in item.ancestry
    )
    assert ins_borrower is not None
    # Verify ancestry for "Commercial" under Real estate finance
    commercial = next(item for item in result.items if item.text == "Commercial")
    assert "Real estate finance (non-securitized)" in commercial.ancestry


def test_markdown_table_parsed():
    """Markdown table with separator row should be parsed as tabular."""
    text = (
        "| Category | Subcategory |\n"
        "| --- | --- |\n"
        "| Insurance | |\n"
        "| | Finance |\n"
        "| | Health |\n"
        "| Contract | |\n"
        "| | Party A |"
    )
    result = parse_text(text)
    # Should be parsed as tabular (hierarchy depends on data pattern)
    assert result.format in ("hierarchical", "flat")
    assert result.total_items > 0


def test_markdown_like_without_separator():
    """Text with pipes but no separator row should fall back to plain text."""
    text = "this | is | just text\nanother | line | here"
    result = parse_text(text)
    assert result.format == "text_multi"
    assert result.total_items == 2


def test_single_tab_delimited_line():
    """A single tab-delimited line → flat single item via tabular."""
    text = "Contract Law\tSection 5"
    result = parse_text(text)
    # Single row with multiple cells → flat with 1 item
    assert result.total_items == 1
    assert result.items[0].text == "Contract Law"
