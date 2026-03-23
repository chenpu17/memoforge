use memoforge_core::get_tags;
use std::path::PathBuf;

fn main() {
    let kb_path = PathBuf::from("test_kb");

    // Test without prefix
    match get_tags(&kb_path, None) {
        Ok(tags) => {
            println!("All tags: {:?}", tags);
            println!("Total: {}", tags.len());
        }
        Err(e) => println!("Error: {}", e.message),
    }

    // Test with prefix
    match get_tags(&kb_path, Some("rust")) {
        Ok(tags) => {
            println!("\nTags with prefix 'rust': {:?}", tags);
        }
        Err(e) => println!("Error: {}", e.message),
    }
}
