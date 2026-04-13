//! Import existing Markdown files
//!
//! Scan a directory for .md files and generate frontmatter for files that don't have it.

use crate::config::{load_config, save_config, CategoryConfig};
use crate::fs::write_knowledge_file;
use crate::*;
use chrono::{DateTime, Utc};
use std::fs;
use std::path::Path;

/// Result of importing a single file
#[derive(Debug, Clone, serde::Serialize)]
pub struct ImportResult {
    pub path: String,
    pub title: String,
    pub had_frontmatter: bool,
    pub generated_frontmatter: bool,
}

/// Import options
#[derive(Debug, Clone)]
pub struct ImportOptions {
    /// Generate frontmatter for files without it
    pub generate_frontmatter: bool,
    /// Register top-level directories as categories
    pub auto_categories: bool,
    /// Dry run - don't actually modify files
    pub dry_run: bool,
}

impl Default for ImportOptions {
    fn default() -> Self {
        Self {
            generate_frontmatter: true,
            auto_categories: true,
            dry_run: false,
        }
    }
}

/// Import statistics
#[derive(Debug, Clone, serde::Serialize)]
pub struct ImportStats {
    pub total_files: usize,
    pub files_with_frontmatter: usize,
    pub files_imported: usize,
    pub categories_created: usize,
    pub results: Vec<ImportResult>,
}

/// Generate a title from filename
fn title_from_filename(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| {
            // Replace dashes and underscores with spaces
            s.replace('-', " ")
                .replace('_', " ")
                // Split on capital letters for camelCase
                .split_whitespace()
                .map(|word| {
                    let mut chars = word.chars();
                    match chars.next() {
                        Some(c) => {
                            c.to_uppercase().collect::<String>()
                                + chars.as_str().to_lowercase().as_str()
                        }
                        None => String::new(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_else(|| "Untitled".to_string())
}

/// Get file modification time as DateTime
fn get_file_mtime(path: &Path) -> std::io::Result<DateTime<Utc>> {
    let metadata = fs::metadata(path)?;
    let modified = metadata.modified()?;
    let datetime: DateTime<Utc> = modified.into();
    Ok(datetime)
}

/// Check if content has frontmatter
fn has_frontmatter(content: &str) -> bool {
    content.starts_with("---\n") && content[4..].contains("\n---\n")
}

/// Import a single Markdown file
fn import_file(
    file_path: &Path,
    kb_path: &Path,
    source_root: &Path,
    options: &ImportOptions,
) -> std::io::Result<ImportResult> {
    let content = fs::read_to_string(file_path)?;
    let relative_path = file_path
        .strip_prefix(source_root)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| file_path.to_string_lossy().to_string());
    let target_path = kb_path.join(&relative_path);

    let had_frontmatter = has_frontmatter(&content);
    let title = title_from_filename(file_path);

    let final_content = if had_frontmatter || !options.generate_frontmatter {
        content
    } else {
        let mtime = get_file_mtime(file_path).unwrap_or_else(|_| Utc::now());
        let category = Path::new(&relative_path)
            .parent()
            .and_then(|p| p.components().next())
            .and_then(|c| c.as_os_str().to_str())
            .map(|s| s.to_string());

        let id = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        let frontmatter = Frontmatter {
            id,
            title: title.clone(),
            tags: Vec::new(),
            category,
            summary: None,
            summary_hash: None,
            created_at: mtime,
            updated_at: mtime,
            evidence: None,
            freshness: None,
        };

        let fm_yaml = serde_yaml::to_string(&frontmatter)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        let body = content.trim_start();
        format!("---\n{}---\n{}", fm_yaml, body)
    };

    if !options.dry_run {
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)?;
        }
        write_knowledge_file(&target_path, &final_content)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.message))?;
    }

    Ok(ImportResult {
        path: relative_path,
        title,
        had_frontmatter,
        generated_frontmatter: !had_frontmatter && options.generate_frontmatter,
    })
}

/// Collect all markdown files in a directory
fn collect_markdown_files(dir: &Path) -> std::io::Result<Vec<std::path::PathBuf>> {
    let mut files = Vec::new();

    if !dir.exists() {
        return Ok(files);
    }

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        // Skip hidden directories and .git, .memoforge
        if path.is_dir() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if !name.starts_with('.') {
                files.extend(collect_markdown_files(&path)?);
            }
        } else if path.extension().map(|e| e == "md").unwrap_or(false) {
            files.push(path);
        }
    }

    Ok(files)
}

/// Get top-level directories in a path
fn get_top_level_dirs(dir: &Path) -> std::io::Result<Vec<String>> {
    let mut dirs = Vec::new();

    if !dir.exists() {
        return Ok(dirs);
    }

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string())
                .unwrap_or_default();

            // Skip hidden directories
            if !name.starts_with('.') {
                dirs.push(name);
            }
        }
    }

    Ok(dirs)
}

/// Import all markdown files from a directory into the knowledge base
pub fn import_markdown_folder(
    kb_path: &Path,
    source_path: &Path,
    options: ImportOptions,
) -> std::io::Result<ImportStats> {
    let mut stats = ImportStats {
        total_files: 0,
        files_with_frontmatter: 0,
        files_imported: 0,
        categories_created: 0,
        results: Vec::new(),
    };

    // Collect all markdown files
    let files = collect_markdown_files(source_path)?;
    stats.total_files = files.len();

    // Auto-register categories if enabled
    if options.auto_categories && !options.dry_run {
        let top_dirs = get_top_level_dirs(source_path)?;
        let mut config =
            load_config(kb_path).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        for dir_name in top_dirs {
            // Check if category already exists
            let exists = config.categories.iter().any(|c| c.name == dir_name);
            if !exists {
                let category = CategoryConfig {
                    id: dir_name.clone(),
                    name: dir_name.clone(),
                    path: dir_name.clone(),
                    parent_id: None,
                    description: None,
                    default_sla_days: None,
                };
                config.categories.push(category);
                stats.categories_created += 1;
            }
        }

        save_config(kb_path, &config)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    }

    // Process each file
    for file_path in &files {
        match import_file(file_path, kb_path, source_path, &options) {
            Ok(result) => {
                if result.had_frontmatter {
                    stats.files_with_frontmatter += 1;
                }
                if result.generated_frontmatter {
                    stats.files_imported += 1;
                }
                stats.results.push(result);
            }
            Err(e) => {
                eprintln!("Failed to import {:?}: {}", file_path, e);
            }
        }
    }

    Ok(stats)
}

/// Preview import without making changes
pub fn preview_import(kb_path: &Path, source_path: &Path) -> std::io::Result<ImportStats> {
    let options = ImportOptions {
        generate_frontmatter: true,
        auto_categories: true,
        dry_run: true,
    };
    import_markdown_folder(kb_path, source_path, options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    fn init_kb(path: &Path) {
        fs::create_dir_all(path.join(".memoforge")).unwrap();
        fs::write(
            path.join(".memoforge/config.yaml"),
            "version: \"1.0\"\nmetadata:\n  name: test\n  created_at: \"2026-03-20T00:00:00Z\"\ncategories: []\n",
        )
        .unwrap();
    }

    #[test]
    fn preview_import_does_not_write_files() {
        let temp = TempDir::new().unwrap();
        let kb = temp.path().join("kb");
        let source = temp.path().join("source");
        init_kb(&kb);
        write(&source.join("notes/hello_world.md"), "# Hello world\n");

        let stats = preview_import(&kb, &source).unwrap();

        assert_eq!(stats.total_files, 1);
        assert_eq!(stats.files_imported, 1);
        assert!(!kb.join("notes/hello_world.md").exists());
    }

    #[test]
    fn import_markdown_folder_generates_frontmatter_and_categories() {
        let temp = TempDir::new().unwrap();
        let kb = temp.path().join("kb");
        let source = temp.path().join("source");
        init_kb(&kb);
        write(&source.join("notes/hello_world.md"), "# Hello world\n");

        let stats = import_markdown_folder(&kb, &source, ImportOptions::default()).unwrap();
        let imported = fs::read_to_string(kb.join("notes/hello_world.md")).unwrap();
        let config = load_config(&kb).unwrap();

        assert_eq!(stats.total_files, 1);
        assert_eq!(stats.files_imported, 1);
        assert_eq!(stats.categories_created, 1);
        assert!(imported.starts_with("---\n"));
        assert!(imported.contains("title: Hello World"));
        assert!(config.categories.iter().any(|category| category.path == "notes"));
    }
}
