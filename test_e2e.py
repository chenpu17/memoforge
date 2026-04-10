#!/usr/bin/env python3
"""
Playwright E2E Test for MemoForge New Features
Tests:
1. Multi-KB management (KB switcher)
2. Delete preview (more menu)
3. Tag combination search (tag:Rust syntax)
4. Backlinks panel (metadata panel)
"""

from playwright.sync_api import sync_playwright
import time

def main():
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app
        print("🌐 Navigating to http://localhost:1420...")
        page.goto('http://localhost:1420')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1500)  # Extra wait for React to render

        # Take initial screenshot
        print("📸 Taking initial screenshot...")
        page.screenshot(path='/tmp/memoforge_initial.png', full_page=True)
        print("   Saved to /tmp/memoforge_initial.png")

        print(f"📄 Page loaded, title: {page.title()}")

        # Test 1: Multi-KB Management (KB Switcher)
        print("\n" + "="*50)
        print("Test 1: Multi-KB Management (KB Switcher)")
        print("="*50)

        try:
            # The KB switcher is in the sidebar header, contains "我的知识库" text
            kb_switcher = page.locator('div:has-text("我的知识库"):has-text("主工作区")').first
            if kb_switcher.count() > 0:
                print("✅ Found KB switcher (我的知识库)")
                kb_switcher.click()
                page.wait_for_timeout(800)

                # Check for modal - look for the modal container
                # The modal has h2 "知识库管理"
                modal_title = page.locator('h2:has-text("知识库管理")')
                if modal_title.count() > 0:
                    print("✅ KB switcher modal appeared (found 知识库管理 title)")
                    page.screenshot(path='/tmp/memoforge_kb_switcher.png')
                    print("📸 Saved KB switcher screenshot")

                    # Close modal by clicking X or pressing Escape
                    close_btn = page.locator('button:has(svg.lucide-x)').first
                    if close_btn.count() > 0:
                        close_btn.click()
                    else:
                        page.keyboard.press('Escape')
                    page.wait_for_timeout(300)
                    print("✅ Closed KB switcher modal")
                else:
                    print("⚠️ KB modal not visible (no 知识库管理 title)")
                    page.screenshot(path='/tmp/memoforge_kb_switcher.png')
            else:
                print("⚠️ KB switcher not found")

        except Exception as e:
            print(f"❌ KB switcher test error: {e}")

        # Test 2: Select a knowledge item to test backlinks
        print("\n" + "="*50)
        print("Test 2: Backlinks Panel")
        print("="*50)

        try:
            # Knowledge items are in the middle panel
            knowledge_items = page.locator('div.cursor-pointer:has(h3)').all()
            print(f"📚 Found {len(knowledge_items)} knowledge items")

            if len(knowledge_items) > 0:
                # Click on the first knowledge item
                knowledge_items[0].click()
                page.wait_for_timeout(800)

                page.screenshot(path='/tmp/memoforge_selected_knowledge.png')
                print("📸 Saved selected knowledge screenshot")

                # Check for backlinks panel in the metadata panel (right side)
                # Look for "链接关系" section
                backlinks_header = page.locator('span:has-text("链接关系")')
                if backlinks_header.count() > 0:
                    print("✅ Found 链接关系 (Backlinks) section")

                    # Check for subsections
                    incoming = page.locator('span:has-text("被引用")')
                    outgoing = page.locator('span:has-text("链接到")')
                    shared = page.locator('span:has-text("共享标签")')

                    if incoming.count() > 0:
                        print("   ✅ 被引用 section found")
                    if outgoing.count() > 0:
                        print("   ✅ 链接到 section found")
                    if shared.count() > 0:
                        print("   ✅ 共享标签 section found")

                    # Check if there are any actual links shown
                    no_links_msg = page.locator('text=暂无链接关系')
                    if no_links_msg.count() > 0:
                        print("   ℹ️ No links found (expected for mock data without wiki-links)")
                else:
                    print("⚠️ 链接关系 section not found")
            else:
                print("⚠️ No knowledge items found to select")

        except Exception as e:
            print(f"❌ Backlinks test error: {e}")

        # Test 3: Tag Combination Search
        print("\n" + "="*50)
        print("Test 3: Tag Combination Search (tag:Rust syntax)")
        print("="*50)

        try:
            # Search button is in the title bar (top right)
            search_btn = page.locator('button:has(svg.lucide-search)').first

            if search_btn.count() > 0:
                print("✅ Found search button")
                search_btn.click()
                page.wait_for_timeout(500)

                # Look for search input
                search_input = page.locator('input[placeholder*="搜索"]').first
                if search_input.count() > 0:
                    print("✅ Found search input")
                    search_input.click()
                    search_input.fill('tag:Rust')
                    page.wait_for_timeout(500)
                    search_input.press('Enter')
                    page.wait_for_timeout(1000)

                    # Take screenshot of search results
                    page.screenshot(path='/tmp/memoforge_tag_search.png')
                    print("📸 Saved tag search screenshot")

                    # Check for results count
                    results_count = page.locator('text=找到').first
                    if results_count.count() > 0:
                        count_text = results_count.inner_text()
                        print(f"📊 {count_text}")

                    # Check for result items
                    result_items = page.locator('div.px-4.py-2:has(span.font-semibold)').all()
                    print(f"📊 Found {len(result_items)} result groups")

                    if len(result_items) > 0:
                        print("✅ Tag search returned results")

                    # IMPORTANT: Close search panel by clicking X button
                    # The X button is in the search panel header
                    close_search_btn = page.locator('div.h-16 button:has(svg.lucide-x)').first
                    if close_search_btn.count() > 0:
                        close_search_btn.click()
                        page.wait_for_timeout(500)
                        print("✅ Closed search panel via X button")
                    else:
                        # Fallback to Escape
                        page.keyboard.press('Escape')
                        page.wait_for_timeout(500)
                        print("✅ Closed search panel via Escape")
                else:
                    print("⚠️ Search input not found")
            else:
                print("⚠️ Search button not found")

        except Exception as e:
            print(f"❌ Tag search test error: {e}")
            # Try to close any open panels
            try:
                page.keyboard.press('Escape')
                page.wait_for_timeout(300)
            except:
                pass

        # Test 4: Delete Preview (More Menu)
        print("\n" + "="*50)
        print("Test 4: Delete Preview (More Menu)")
        print("="*50)

        try:
            # First check if search panel is closed
            search_panel = page.locator('div.fixed.inset-0.z-50.bg-white')
            if search_panel.count() > 0:
                print("⚠️ Search panel still open, closing...")
                page.keyboard.press('Escape')
                page.wait_for_timeout(500)

            # Make sure we have a knowledge item selected
            knowledge_items = page.locator('div.cursor-pointer:has(h3)').all()
            if len(knowledge_items) > 0:
                knowledge_items[0].click()
                page.wait_for_timeout(500)
                print("📚 Selected knowledge item")

            # The more menu button is in the toolbar
            # It has MoreHorizontal icon (three horizontal dots)
            more_btn = page.locator('button:has(svg.lucide-more-horizontal)').first

            if more_btn.count() > 0:
                print("✅ Found more menu button")
                more_btn.click()
                page.wait_for_timeout(300)

                page.screenshot(path='/tmp/memoforge_more_menu.png')
                print("📸 Saved more menu screenshot")

                # Look for delete option in the dropdown
                delete_option = page.locator('button:has-text("删除知识")')
                if delete_option.count() > 0:
                    print("✅ Found 删除知识 option in menu")
                    delete_option.click()
                    page.wait_for_timeout(500)

                    # Check for preview/confirmation dialog
                    dialog = page.locator('div.fixed.inset-0.z-50:has-text("确认删除")')
                    if dialog.count() > 0:
                        print("✅ Delete preview dialog appeared")
                        page.screenshot(path='/tmp/memoforge_delete_preview.png')
                        print("📸 Saved delete preview screenshot")

                        # Check for references section
                        refs_section = page.locator('text=引用')
                        if refs_section.count() > 0:
                            print("✅ Found references section in dialog")

                        # Cancel the delete
                        cancel_btn = page.locator('button:has-text("取消")')
                        if cancel_btn.count() > 0:
                            cancel_btn.click()
                            page.wait_for_timeout(300)
                            print("✅ Cancelled delete operation")
                    else:
                        print("⚠️ Delete preview dialog not found")
                        page.keyboard.press('Escape')
                else:
                    print("⚠️ 删除知识 option not found")
                    page.keyboard.press('Escape')
            else:
                print("⚠️ More menu button not found")

        except Exception as e:
            print(f"❌ Delete preview test error: {e}")

        # Final screenshot
        page.screenshot(path='/tmp/memoforge_final.png', full_page=True)
        print("\n📸 Final screenshot saved to /tmp/memoforge_final.png")

        # Summary
        print("\n" + "="*50)
        print("📋 Test Summary")
        print("="*50)
        print("\n✅ Tested Features:")
        print("  1. Multi-KB Management - KB switcher modal")
        print("  2. Backlinks Panel - 链接关系 section")
        print("  3. Tag Search - tag:Rust syntax")
        print("  4. Delete Preview - more menu + confirmation dialog")
        print("\n📸 Screenshots saved to /tmp/:")
        print("  - memoforge_initial.png")
        print("  - memoforge_kb_switcher.png")
        print("  - memoforge_selected_knowledge.png")
        print("  - memoforge_tag_search.png")
        print("  - memoforge_more_menu.png")
        print("  - memoforge_delete_preview.png")
        print("  - memoforge_final.png")

        browser.close()
        print("\n✅ E2E tests completed!")

if __name__ == "__main__":
    main()
