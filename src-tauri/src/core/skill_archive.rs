use std::fs::File;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use anyhow::Context;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

pub fn zip_directory(dir: &Path) -> anyhow::Result<Vec<u8>> {
    if !dir.is_dir() {
        anyhow::bail!("skill directory not found: {}", dir.display());
    }

    let base = dir
        .canonicalize()
        .with_context(|| format!("cannot resolve skill path: {}", dir.display()))?;

    let mut buffer = Vec::new();
    {
        let cursor = std::io::Cursor::new(&mut buffer);
        let mut zip = ZipWriter::new(cursor);
        let opts = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .unix_permissions(0o644);

        for entry in WalkDir::new(&base).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                let rel = path
                    .strip_prefix(&base)
                    .with_context(|| format!("invalid skill path: {}", path.display()))?;
                let name = rel.to_string_lossy().replace('\\', "/");
                zip.start_file(&name, opts)
                    .with_context(|| format!("zip write failed: {name}"))?;
                let mut file = File::open(path)?;
                let mut contents = Vec::new();
                file.read_to_end(&mut contents)?;
                zip.write_all(&contents)?;
            }
        }

        zip.finish()?;
    }

    if buffer.is_empty() {
        anyhow::bail!("skill directory is empty");
    }

    Ok(buffer)
}

pub fn unzip_to_directory(data: &[u8], dest: &Path) -> anyhow::Result<()> {
    std::fs::create_dir_all(dest)?;
    let cursor = std::io::Cursor::new(data);
    let mut archive = zip::ZipArchive::new(cursor).context("invalid zip archive")?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .with_context(|| format!("zip entry read failed at index {i}"))?;
        let rel = sanitize_zip_entry_path(file.name())?;
        let outpath = dest.join(rel);

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath)?;
            continue;
        }

        if let Some(parent) = outpath.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut outfile = File::create(&outpath)?;
        std::io::copy(&mut file, &mut outfile)?;
    }

    Ok(())
}

fn sanitize_zip_entry_path(name: &str) -> anyhow::Result<PathBuf> {
    let path = Path::new(name);
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            _ => anyhow::bail!("unsafe zip entry: {name}"),
        }
    }
    Ok(clean)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn zip_and_unzip_roundtrip() {
        let tmp = tempdir().unwrap();
        let source = tmp.path().join("skill");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("SKILL.md"), "hello").unwrap();
        std::fs::write(source.join("body.md"), "world").unwrap();

        let zip = zip_directory(&source).unwrap();
        let dest = tmp.path().join("restored");
        unzip_to_directory(&zip, &dest).unwrap();

        assert_eq!(
            std::fs::read_to_string(dest.join("SKILL.md")).unwrap(),
            "hello"
        );
    }
}
