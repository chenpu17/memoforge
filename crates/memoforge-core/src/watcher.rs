//! 文件监听模块
//! 参考: PRD §7, 技术实现 §2

use notify::{Watcher, RecursiveMode, Event};
use std::path::Path;
use std::sync::mpsc::channel;

pub type WatcherCallback = Box<dyn Fn(&Event) + Send>;

/// 创建文件监听器
pub fn create_watcher<P: AsRef<Path>>(
    path: P,
    callback: WatcherCallback,
) -> Result<notify::RecommendedWatcher, notify::Error> {
    let (tx, rx) = channel();

    let mut watcher = notify::recommended_watcher(move |res| {
        if let Ok(event) = res {
            tx.send(event).ok();
        }
    })?;

    watcher.watch(path.as_ref(), RecursiveMode::Recursive)?;

    // 启动事件处理线程
    std::thread::spawn(move || {
        while let Ok(event) = rx.recv() {
            callback(&event);
        }
    });

    Ok(watcher)
}
