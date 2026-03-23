#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::TempDir;

    #[test]
    fn test_init_new_without_template() {
        let temp = TempDir::new().unwrap();
        let path = temp.path();

        assert!(!is_initialized(path));
        init_new(path, false).unwrap();
        assert!(is_initialized(path));
        assert!(path.join(".memoforge/config.yaml").exists());
        assert!(path.join(".gitignore").exists());
    }

    #[test]
    fn test_init_new_with_template() {
        let temp = TempDir::new().unwrap();
        let path = temp.path();

        init_new(path, true).unwrap();
        assert!(path.join("welcome.md").exists());
        assert!(path.join("开发/rust-async.md").exists());
        assert!(path.join("开发/git-workflow.md").exists());
    }

    #[test]
    fn test_init_open() {
        let temp = TempDir::new().unwrap();
        let path = temp.path();

        assert!(init_open(path).is_err());
        init_new(path, false).unwrap();
        assert!(init_open(path).is_ok());
    }
}
