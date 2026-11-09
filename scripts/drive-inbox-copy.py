#!/usr/bin/env python3
"""Copy one file out of the Google Drive (File Provider) folder.

Processes started by launchd are not allowed to download "online-only"
(dataless) cloud files by default — reads fail with EDEADLK
("Resource deadlock avoided"). This turns materialisation on for this
process only (setiopolicy_np), then copies the file. Usage: SRC DEST
"""
import ctypes, shutil, sys

IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES = 3
IOPOL_SCOPE_PROCESS = 0
IOPOL_MATERIALIZE_DATALESS_FILES_ON = 2

libc = ctypes.CDLL("/usr/lib/libc.dylib", use_errno=True)
libc.setiopolicy_np(IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES,
                    IOPOL_SCOPE_PROCESS, IOPOL_MATERIALIZE_DATALESS_FILES_ON)

src, dest = sys.argv[1], sys.argv[2]
shutil.copyfile(src, dest)
