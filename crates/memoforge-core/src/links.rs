//! 双向链接模块
//! 解析 [[wiki-link]] 语法并建立反向链接索引

use crate::*;
use regex::Regex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

/// 链接信息
#[derive(Debug, Clone, Serialize)]
pub struct LinkInfo {
    /// 源知识 ID
    pub source_id: String,
    /// 源知识标题
    pub source_title: String,
    /// 链接文本
    pub link_text: String,
    /// 链接显示文本（如果有 |display 语法）
    pub display_text: Option<String>,
    /// 行号
    pub line_number: usize,
}

/// 反向链接结果
#[derive(Debug, Clone, Serialize)]
pub struct BacklinksResult {
    /// 目标知识 ID
    pub target_id: String,
    /// 指向此知识的链接列表
    pub backlinks: Vec<LinkInfo>,
}

/// 相关知识结果
#[derive(Debug, Clone, Serialize)]
pub struct RelatedResult {
    /// 知识 ID
    pub id: String,
    /// 相关知识列表
    pub related: Vec<RelatedKnowledge>,
}

/// 相关知识条目
#[derive(Debug, Clone, Serialize)]
pub struct RelatedKnowledge {
    /// 知识 ID
    pub id: String,
    /// 知识标题
    pub title: String,
    /// 关联类型
    pub relation_type: RelationType,
}

/// 关联类型
#[derive(Debug, Clone, Serialize, PartialEq)]
pub enum RelationType {
    /// 正向链接（此知识链接到其他知识）
    Outgoing,
    /// 反向链接（其他知识链接到此知识）
    Incoming,
    /// 共享标签
    SharedTags,
}

/// 解析知识内容中的 [[wiki-link]]
pub fn parse_wiki_links(content: &str) -> Vec<(String, Option<String>, usize)> {
    let re = Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").unwrap();
    let mut links = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        for cap in re.captures_iter(line) {
            let link_text = cap
                .get(1)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default();
            let display_text = cap.get(2).map(|m| m.as_str().to_string());
            links.push((link_text, display_text, line_num + 1));
        }
    }

    links
}

/// 将链接文本解析为可能的知识 ID
fn resolve_link_to_knowledge_id(link_text: &str, kb_path: &Path) -> Option<String> {
    // 尝试直接匹配文件名
    let candidates = vec![link_text.to_string(), format!("{}.md", link_text)];

    for candidate in candidates {
        let path = kb_path.join(&candidate);
        if path.exists() {
            return Some(candidate);
        }
    }

    // 尝试在所有知识中查找标题匹配
    if let Ok(files) = collect_markdown_files(kb_path) {
        for file_path in files {
            if let Ok(content) = fs::read_to_string(&file_path) {
                if let Ok((fm, _)) = parse_frontmatter(&content) {
                    if &fm.title == link_text || &fm.id == link_text {
                        if let Ok(relative) = file_path.strip_prefix(kb_path) {
                            return Some(relative.to_string_lossy().replace('\\', "/"));
                        }
                    }
                }
            }
        }
    }

    None
}

/// 收集所有 markdown 文件
fn collect_markdown_files(dir: &Path) -> Result<Vec<std::path::PathBuf>, MemoError> {
    let mut files = Vec::new();

    fn walk(dir: &Path, files: &mut Vec<std::path::PathBuf>) -> Result<(), MemoError> {
        let entries = fs::read_dir(dir).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to read directory: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        for entry in entries {
            let entry = entry.map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Failed to read entry: {}", e),
                retry_after_ms: None,
                context: None,
            })?;

            let path = entry.path();
            let file_type = entry.file_type().map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Failed to read file type: {}", e),
                retry_after_ms: None,
                context: None,
            })?;

            if file_type.is_dir() {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if !matches!(name, ".git" | ".memoforge") {
                    walk(&path, files)?;
                }
            } else if file_type.is_file()
                && path.extension().and_then(|ext| ext.to_str()) == Some("md")
            {
                files.push(path);
            }
        }

        Ok(())
    }

    walk(dir, &mut files)?;
    Ok(files)
}

/// 获取知识的正向链接（此知识链接到哪些其他知识）
pub fn get_outgoing_links(kb_path: &Path, knowledge_id: &str) -> Result<Vec<LinkInfo>, MemoError> {
    // 修复：正确处理路径解析
    let mut path = kb_path.join(knowledge_id);
    if !path.exists() {
        // 尝试添加 .md 后缀
        path = kb_path.join(format!("{}.md", knowledge_id));
        if !path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Knowledge not found: {}", knowledge_id),
                retry_after_ms: None,
                context: None,
            });
        }
    }

    let content = fs::read_to_string(&path).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to read file: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    let (fm, _) = parse_frontmatter(&content)?;
    let wiki_links = parse_wiki_links(&content);
    let mut links = Vec::new();

    for (link_text, display_text, line_number) in wiki_links {
        if let Some(target_id) = resolve_link_to_knowledge_id(&link_text, kb_path) {
            links.push(LinkInfo {
                source_id: knowledge_id.to_string(),
                source_title: fm.title.clone(),
                link_text: target_id,
                display_text,
                line_number,
            });
        }
    }

    Ok(links)
}

/// 获取知识的反向链接（哪些知识链接到此知识）
pub fn get_backlinks(kb_path: &Path, knowledge_id: &str) -> Result<BacklinksResult, MemoError> {
    let target_path = kb_path.join(knowledge_id);
    let target_title = if target_path.exists() {
        let content = fs::read_to_string(&target_path).unwrap_or_default();
        parse_frontmatter(&content)
            .map(|(fm, _)| fm.title)
            .unwrap_or_else(|_| knowledge_id.to_string())
    } else {
        knowledge_id.to_string()
    };

    // 知识 ID 的可能形式
    let target_id_stem = knowledge_id.trim_end_matches(".md");
    let target_variants = vec![
        target_id_stem.to_string(),
        format!("{}.md", target_id_stem),
        target_title.clone(),
    ];

    let mut backlinks = Vec::new();

    // 遍历所有知识，查找链接到此知识的条目
    let files = collect_markdown_files(kb_path)?;
    for file_path in files {
        let relative = file_path
            .strip_prefix(kb_path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        // 跳过自身
        if relative == knowledge_id || relative == format!("{}.md", knowledge_id) {
            continue;
        }

        let content = match fs::read_to_string(&file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let (fm, _) = match parse_frontmatter(&content) {
            Ok(result) => result,
            Err(_) => continue,
        };

        let wiki_links = parse_wiki_links(&content);
        for (link_text, display_text, line_number) in wiki_links {
            // 检查链接是否指向目标知识
            if target_variants.iter().any(|v| {
                link_text == *v
                    || link_text == v.trim_end_matches(".md")
                    || resolve_link_to_knowledge_id(&link_text, kb_path).as_ref()
                        == Some(&knowledge_id.to_string())
                    || resolve_link_to_knowledge_id(&link_text, kb_path).as_ref()
                        == Some(&format!("{}.md", knowledge_id))
            }) {
                backlinks.push(LinkInfo {
                    source_id: relative.clone(),
                    source_title: fm.title.clone(),
                    link_text: knowledge_id.to_string(),
                    display_text,
                    line_number,
                });
                break; // 每个源知识只记录一次
            }
        }
    }

    Ok(BacklinksResult {
        target_id: knowledge_id.to_string(),
        backlinks,
    })
}

/// 获取相关知识（正向链接 + 反向链接 + 共享标签）
pub fn get_related(kb_path: &Path, knowledge_id: &str) -> Result<RelatedResult, MemoError> {
    let mut related_map: HashMap<String, RelatedKnowledge> = HashMap::new();

    // 获取当前知识
    let path = kb_path.join(knowledge_id);
    let content = fs::read_to_string(&path).map_err(|e| MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: format!("Knowledge not found: {}", e),
        retry_after_ms: None,
        context: None,
    })?;
    let (fm, _body) = parse_frontmatter(&content)?;
    let current_tags: HashSet<String> = fm.tags.iter().cloned().collect();

    // 1. 正向链接
    let outgoing = get_outgoing_links(kb_path, knowledge_id)?;
    for link in outgoing {
        if let Ok(target_content) = fs::read_to_string(kb_path.join(&link.link_text)) {
            if let Ok((target_fm, _)) = parse_frontmatter(&target_content) {
                related_map
                    .entry(link.link_text.clone())
                    .or_insert(RelatedKnowledge {
                        id: link.link_text,
                        title: target_fm.title,
                        relation_type: RelationType::Outgoing,
                    });
            }
        }
    }

    // 2. 反向链接
    let backlinks = get_backlinks(kb_path, knowledge_id)?;
    for link in backlinks.backlinks {
        if let Ok(target_content) = fs::read_to_string(kb_path.join(&link.source_id)) {
            if let Ok((target_fm, _)) = parse_frontmatter(&target_content) {
                related_map
                    .entry(link.source_id.clone())
                    .or_insert(RelatedKnowledge {
                        id: link.source_id,
                        title: target_fm.title,
                        relation_type: RelationType::Incoming,
                    });
            }
        }
    }

    // 3. 共享标签
    let files = collect_markdown_files(kb_path)?;
    for file_path in files {
        let relative = file_path
            .strip_prefix(kb_path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        // 跳过自身
        if relative == knowledge_id || relative == format!("{}.md", knowledge_id) {
            continue;
        }

        if let Ok(target_content) = fs::read_to_string(&file_path) {
            if let Ok((target_fm, _)) = parse_frontmatter(&target_content) {
                let target_tags: HashSet<String> = target_fm.tags.iter().cloned().collect();
                let shared = current_tags.intersection(&target_tags).count();

                if shared > 0 && !related_map.contains_key(&relative) {
                    related_map.insert(
                        relative.clone(),
                        RelatedKnowledge {
                            id: relative,
                            title: target_fm.title,
                            relation_type: RelationType::SharedTags,
                        },
                    );
                }
            }
        }
    }

    let mut related: Vec<_> = related_map.into_values().collect();
    related.sort_by(|a, b| {
        // 排序优先级：Outgoing > Incoming > SharedTags
        let order = |t: &RelationType| match t {
            RelationType::Outgoing => 0,
            RelationType::Incoming => 1,
            RelationType::SharedTags => 2,
        };
        order(&a.relation_type).cmp(&order(&b.relation_type))
    });

    Ok(RelatedResult {
        id: knowledge_id.to_string(),
        related,
    })
}

/// 更新引用结果
#[derive(Debug, Clone, Serialize)]
pub struct UpdateReferencesResult {
    /// 受影响的文件列表
    pub affected_files: Vec<AffectedFile>,
    /// 总更新数量
    pub total_updates: usize,
}

/// 受影响的文件
#[derive(Debug, Clone, Serialize)]
pub struct AffectedFile {
    /// 文件路径
    pub path: String,
    /// 更新的链接数量
    pub links_updated: usize,
}

/// 更新全库中引用了旧路径的文件
///
/// 当知识被移动/重命名时，需要更新所有引用它的文件：
/// 1. 正文中的 [[wiki-links]]
///
/// # Arguments
/// * `kb_path` - 知识库根路径
/// * `old_path` - 旧的知识路径（相对路径，如 "programming/rust/async.md"）
/// * `new_path` - 新的知识路径（相对路径）
///
/// # Returns
/// * `Ok(UpdateReferencesResult)` - 受影响的文件列表和更新数量
/// * `Err(MemoError)` - 更新失败
pub fn update_references(
    kb_path: &Path,
    old_path: &str,
    new_path: &str,
) -> Result<UpdateReferencesResult, MemoError> {
    let normalize_link_key = |value: &str| value.trim().trim_matches('/').replace('\\', "/");
    let old_path = normalize_link_key(old_path);
    let new_path = normalize_link_key(new_path);
    let old_path_no_ext = old_path
        .strip_suffix(".md")
        .unwrap_or(&old_path)
        .to_string();
    let new_path_no_ext = new_path
        .strip_suffix(".md")
        .unwrap_or(&new_path)
        .to_string();
    let old_file_name = Path::new(&old_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&old_path)
        .to_string();
    let new_file_name = Path::new(&new_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&new_path)
        .to_string();
    let old_name = Path::new(&old_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&old_path)
        .to_string();
    let new_name = Path::new(&new_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&new_path)
        .to_string();

    let wiki_link_pattern = Regex::new(r"\[\[([^\]|]+)(\|[^\]]+)?\]\]").map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to create regex pattern: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    let mut affected_files = Vec::new();
    let mut total_updates = 0;

    // 遍历所有 markdown 文件
    let files = collect_markdown_files(kb_path)?;
    for file_path in files {
        let relative = file_path
            .strip_prefix(kb_path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        // 跳过被移动的文件本身
        if relative == old_path
            || relative == format!("{}.md", old_path)
            || relative == new_path
            || relative == format!("{}.md", new_path)
        {
            continue;
        }

        let content = match fs::read_to_string(&file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut links_updated = 0;
        let new_content = wiki_link_pattern
            .replace_all(&content, |caps: &regex::Captures| {
                let link_text = caps.get(1).map(|m| m.as_str()).unwrap_or_default();
                let display = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                let normalized_link = normalize_link_key(link_text);

                let replacement = if normalized_link == old_path {
                    Some(new_path.clone())
                } else if normalized_link == old_path_no_ext {
                    Some(new_path_no_ext.clone())
                } else if normalized_link == old_file_name {
                    Some(new_file_name.clone())
                } else if normalized_link == old_name && old_name != new_name {
                    Some(new_name.clone())
                } else {
                    None
                };

                if let Some(value) = replacement {
                    if value != link_text {
                        links_updated += 1;
                        format!("[[{}{}]]", value, display)
                    } else {
                        caps.get(0)
                            .map(|m| m.as_str())
                            .unwrap_or_default()
                            .to_string()
                    }
                } else {
                    caps.get(0)
                        .map(|m| m.as_str())
                        .unwrap_or_default()
                        .to_string()
                }
            })
            .to_string();

        // 如果有更新，写入文件
        if links_updated > 0 {
            fs::write(&file_path, &new_content).map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Failed to write file {}: {}", relative, e),
                retry_after_ms: None,
                context: None,
            })?;

            affected_files.push(AffectedFile {
                path: relative,
                links_updated,
            });
            total_updates += links_updated;
        }
    }

    Ok(UpdateReferencesResult {
        affected_files,
        total_updates,
    })
}

/// 知识图谱节点
#[derive(Debug, Clone, Serialize)]
pub struct GraphNode {
    /// 知识 ID
    pub id: String,
    /// 知识标题
    pub title: String,
    /// 分类 ID
    pub category_id: Option<String>,
    /// 标签列表
    pub tags: Vec<String>,
}

/// 知识图谱边
#[derive(Debug, Clone, Serialize)]
pub struct GraphEdge {
    /// 源节点 ID
    pub source: String,
    /// 目标节点 ID
    pub target: String,
    /// 关系类型
    pub relation: GraphRelationType,
}

/// 图谱关系类型
#[derive(Debug, Clone, Serialize, PartialEq, Eq, Hash)]
pub enum GraphRelationType {
    /// Wiki 链接 [[target]]
    WikiLink,
    /// 共享标签
    SharedTag,
    /// 同分类
    SameCategory,
}

/// 知识图谱
#[derive(Debug, Clone, Serialize)]
pub struct KnowledgeGraph {
    /// 所有节点
    pub nodes: Vec<GraphNode>,
    /// 所有边
    pub edges: Vec<GraphEdge>,
}

/// 图谱构建选项
#[derive(Debug, Clone)]
pub struct GraphOptions {
    /// 最大节点数量（用于限制大图）
    pub max_nodes: Option<usize>,
    /// 最大边数量
    pub max_edges: Option<usize>,
    /// 是否包含共享标签边
    pub include_shared_tags: bool,
    /// 共享标签边最大数量
    pub max_shared_tag_edges: Option<usize>,
}

impl Default for GraphOptions {
    fn default() -> Self {
        Self {
            max_nodes: None,
            max_edges: None,
            include_shared_tags: true,
            max_shared_tag_edges: Some(500), // 默认限制共享标签边数量
        }
    }
}

/// 构建知识图谱
///
/// 遍历所有知识，提取节点和边
pub fn build_knowledge_graph(kb_path: &Path) -> Result<KnowledgeGraph, MemoError> {
    build_knowledge_graph_with_options(kb_path, GraphOptions::default())
}

/// 构建知识图谱（带选项）
pub fn build_knowledge_graph_with_options(
    kb_path: &Path,
    options: GraphOptions,
) -> Result<KnowledgeGraph, MemoError> {
    let mut nodes: Vec<GraphNode> = Vec::new();
    let mut edges: Vec<GraphEdge> = Vec::new();
    let mut seen_edges: HashSet<(String, String, GraphRelationType)> = HashSet::new();

    // 收集所有知识文件
    let files = collect_markdown_files(kb_path)?;

    // 用于存储知识的元信息
    let mut knowledge_map: HashMap<String, (String, Option<String>, Vec<String>)> = HashMap::new();

    // 第一遍：收集所有节点信息
    for file_path in &files {
        // 应用节点数量限制
        if let Some(max) = options.max_nodes {
            if nodes.len() >= max {
                break;
            }
        }

        let relative = file_path
            .strip_prefix(kb_path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let (fm, _) = match parse_frontmatter(&content) {
            Ok(result) => result,
            Err(_) => continue,
        };

        let node = GraphNode {
            id: relative.clone(),
            title: fm.title.clone(),
            category_id: fm.category.clone(),
            tags: fm.tags.clone(),
        };
        nodes.push(node);

        knowledge_map.insert(relative, (fm.title, fm.category, fm.tags));
    }

    // 应用边数量限制
    let max_edges = options.max_edges.unwrap_or(usize::MAX);

    // 第二遍：构建 Wiki 链接边
    for file_path in &files {
        if edges.len() >= max_edges {
            break;
        }

        let source_id = file_path
            .strip_prefix(kb_path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        if !knowledge_map.contains_key(&source_id) {
            continue;
        }

        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Wiki 链接边
        let wiki_links = parse_wiki_links(&content);
        for (link_text, _display, _line) in wiki_links {
            if edges.len() >= max_edges {
                break;
            }

            if let Some(target_id) = resolve_link_to_knowledge_id(&link_text, kb_path) {
                let edge_key = (
                    source_id.clone(),
                    target_id.clone(),
                    GraphRelationType::WikiLink,
                );
                if !seen_edges.contains(&edge_key) && knowledge_map.contains_key(&target_id) {
                    seen_edges.insert(edge_key.clone());
                    edges.push(GraphEdge {
                        source: source_id.clone(),
                        target: target_id,
                        relation: GraphRelationType::WikiLink,
                    });
                }
            }
        }
    }

    // 共享标签边 - 使用倒排索引优化
    if options.include_shared_tags && edges.len() < max_edges {
        // 构建倒排索引: tag -> Vec<knowledge_id>
        let mut tag_index: HashMap<String, Vec<String>> = HashMap::new();
        for (id, (_, _, tags)) in &knowledge_map {
            for tag in tags {
                tag_index
                    .entry(tag.clone())
                    .or_insert_with(Vec::new)
                    .push(id.clone());
            }
        }

        // 从倒排索引构建共享标签边
        let mut shared_tag_edges: HashMap<(String, String), usize> = HashMap::new();
        for (_tag, ids) in &tag_index {
            if ids.len() < 2 {
                continue;
            }
            // 对于每个标签，连接所有拥有该标签的知识对
            for i in 0..ids.len() {
                for j in (i + 1)..ids.len() {
                    let id1 = &ids[i];
                    let id2 = &ids[j];
                    // 确保顺序一致
                    let key = if id1 < id2 {
                        (id1.clone(), id2.clone())
                    } else {
                        (id2.clone(), id1.clone())
                    };
                    *shared_tag_edges.entry(key).or_insert(0) += 1;
                }
            }
        }

        // 按共享标签数量排序，添加到边列表
        let mut sorted_edges: Vec<_> = shared_tag_edges.into_iter().collect();
        sorted_edges.sort_by(|a, b| b.1.cmp(&a.1).reverse());

        let max_shared = options.max_shared_tag_edges.unwrap_or(500);
        for ((source, target), _count) in sorted_edges.into_iter().take(max_shared) {
            if edges.len() >= max_edges {
                break;
            }
            let edge_key = (source.clone(), target.clone(), GraphRelationType::SharedTag);
            if !seen_edges.contains(&edge_key) {
                seen_edges.insert(edge_key);
                edges.push(GraphEdge {
                    source,
                    target,
                    relation: GraphRelationType::SharedTag,
                });
            }
        }
    }

    Ok(KnowledgeGraph { nodes, edges })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_wiki_links() {
        let content = r#"
# Title

See [[other-note]] for more info.
Also check [[rust-async|async programming]].
"#;
        let links = parse_wiki_links(content);
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].0, "other-note");
        assert_eq!(links[0].1, None);
        assert_eq!(links[1].0, "rust-async");
        assert_eq!(links[1].1, Some("async programming".to_string()));
    }
}
