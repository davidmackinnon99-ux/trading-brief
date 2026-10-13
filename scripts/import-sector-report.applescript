-- Save the newest rich sector-rotation Markdown attachment from Apple Mail.
-- The caller supplies a temporary output directory; moving it into the canonical
-- Briefs folder is handled by the shell only after a valid attachment is saved.
on run argv
    if (count of argv) is not 1 then error "Expected temporary output directory"
    set outputDir to item 1 of argv
    tell application "Mail"
        set candidates to every message of inbox whose subject starts with "Sector Rotation — US close "
        if (count of candidates) is 0 then return ""
        set newestMessage to item 1 of candidates
        repeat with m in candidates
            if (date received of m) > (date received of newestMessage) then set newestMessage to m
        end repeat
        repeat with a in mail attachments of newestMessage
            set attachmentName to name of a
            if attachmentName starts with "sector_rotation_" and attachmentName ends with ".md" then
                set outputPath to outputDir & "/" & attachmentName
                save a in POSIX file outputPath
                return outputPath
            end if
        end repeat
    end tell
    return ""
end run

