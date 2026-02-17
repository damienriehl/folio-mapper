# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for FOLIO Mapper desktop backend (one-folder build)."""

import sys
from pathlib import Path

block_cipher = None

a = Analysis(
    ["run_desktop.py"],
    pathex=["."],
    binaries=[],
    datas=[],
    hiddenimports=[
        # FastAPI + ASGI
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # App routers
        "app.routers.parse",
        "app.routers.mapping",
        "app.routers.llm",
        "app.routers.pipeline",
        "app.routers.export",
        "app.routers.github",
        # App models
        "app.models.parse_models",
        "app.models.mapping_models",
        "app.models.llm_models",
        "app.models.pipeline_models",
        "app.models.export_models",
        # App services
        "app.services.text_parser",
        "app.services.file_parser",
        "app.services.hierarchy_detector",
        "app.services.folio_service",
        "app.services.branch_config",
        "app.services.branch_sort",
        "app.services.export_service",
        "app.services.export_scope",
        "app.services.export_tree_html",
        # LLM services
        "app.services.llm.base",
        "app.services.llm.registry",
        "app.services.llm.openai_compat",
        "app.services.llm.anthropic_provider",
        "app.services.llm.google_provider",
        "app.services.llm.cohere_provider",
        "app.services.llm.github_models_provider",
        # Pipeline services
        "app.services.pipeline.prompts",
        "app.services.pipeline.stage0_prescan",
        "app.services.pipeline.stage1_filter",
        "app.services.pipeline.stage1b_expand",
        "app.services.pipeline.stage2_rank",
        "app.services.pipeline.stage3_judge",
        "app.services.pipeline.mandatory_fallback",
        "app.services.pipeline.orchestrator",
        # Static files for desktop mode
        "starlette.staticfiles",
        # C extensions
        "rapidfuzz",
        "rapidfuzz.fuzz",
        "rapidfuzz.process",
        "rapidfuzz.utils",
        "marisa_trie",
        # FOLIO library
        "folio",
        "alea_llm_client",
        # HTTP clients
        "httpx",
        "httpcore",
        "multipart",
        # Excel export
        "openpyxl",
        # LLM SDKs
        "openai",
        "anthropic",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "pytest",
        "pytest_asyncio",
        "tkinter",
        "matplotlib",
        "scipy",
        "numpy.testing",
        "IPython",
        "jupyter",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="run_desktop",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # Keep console for logging
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="folio-mapper",
)
