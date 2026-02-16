from app.services.hierarchy_detector import (
    build_tree,
    detect_hierarchy,
    parse_hierarchical,
)


def test_detect_flat():
    rows = [
        ["Contract Law"],
        ["Tort Law"],
        ["Property Law"],
    ]
    assert detect_hierarchy(rows) is False


def test_detect_hierarchical():
    rows = [
        ["Litigation", "", ""],
        ["", "Class Action", ""],
        ["", "", "Securities"],
        ["", "", "Consumer Protection"],
        ["", "Individual", ""],
        ["", "", "Personal Injury"],
        ["", "", "Medical Malpractice"],
        ["Transactional", "", ""],
        ["", "Mergers & Acquisitions", ""],
        ["", "", "Due Diligence"],
    ]
    assert detect_hierarchy(rows) is True


def test_detect_empty():
    assert detect_hierarchy([]) is False


def test_detect_single_column():
    rows = [["A"], ["B"], ["C"]]
    assert detect_hierarchy(rows) is False


def test_build_tree_simple():
    rows = [
        ["Litigation", "", ""],
        ["", "Class Action", ""],
        ["", "", "Securities"],
        ["", "", "Consumer Protection"],
    ]
    tree = build_tree(rows)
    assert len(tree) == 1
    assert tree[0].label == "Litigation"
    assert len(tree[0].children) == 1
    assert tree[0].children[0].label == "Class Action"
    assert len(tree[0].children[0].children) == 2
    assert tree[0].children[0].children[0].label == "Securities"
    assert tree[0].children[0].children[1].label == "Consumer Protection"


def test_build_tree_multiple_roots():
    rows = [
        ["Litigation", "", ""],
        ["", "Class Action", ""],
        ["Transactional", "", ""],
        ["", "M&A", ""],
    ]
    tree = build_tree(rows)
    assert len(tree) == 2
    assert tree[0].label == "Litigation"
    assert tree[1].label == "Transactional"


def test_build_tree_skips_blank_rows():
    rows = [
        ["Litigation", "", ""],
        ["", "", ""],
        ["", "Class Action", ""],
    ]
    tree = build_tree(rows)
    assert len(tree) == 1
    assert tree[0].children[0].label == "Class Action"


def test_parse_hierarchical_leaves():
    rows = [
        ["Litigation", "", ""],
        ["", "Class Action", ""],
        ["", "", "Securities"],
        ["", "", "Consumer Protection"],
        ["", "Individual", ""],
        ["", "", "Personal Injury"],
    ]
    result = parse_hierarchical(rows, filename="test.csv")
    assert result.format == "hierarchical"
    assert result.total_items == 3  # 3 leaf nodes
    assert result.items[0].text == "Securities"
    assert result.items[0].ancestry == ["Litigation", "Class Action"]
    assert result.items[1].text == "Consumer Protection"
    assert result.items[2].text == "Personal Injury"
    assert result.items[2].ancestry == ["Litigation", "Individual"]
    assert result.hierarchy is not None
    assert result.source_filename == "test.csv"


def test_parse_hierarchical_indices():
    rows = [
        ["A", ""],
        ["", "B"],
        ["", "C"],
    ]
    result = parse_hierarchical(rows)
    assert [item.index for item in result.items] == [0, 1]
