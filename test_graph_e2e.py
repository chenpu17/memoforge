#!/usr/bin/env python3
import sys
sys.path.insert(0, '/Users/chenpu/.claude/plugins/cache/anthropic-agent-skills/document-skills/webapp-testing')
from playwright.sync_api import sync_playwright, import time

def test_external_links():
    """Test that external links open in system browser"""
    print("🧪 Testing External Links...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to test page
        page.goto('http://localhost:1420')
        page.wait_for_load_state('networkidle')

        # Take initial screenshot
        page.screenshot(path='/tmp/test_external_links_1.png')
        print("  ✅ Initial page loaded")

        # Find a link in the content and create a markdown content with external links
        md_content = """
# <div class="prose">
        <p><a href="https://example.com" class="external-link">External Link</a>
        <p><a href="https://tauri.org">Tauri application</a>
        <p>Click me to open in browser</p>
      </        </li>
      </    except:
      # Simulate click on external link
      page.locator('.external-link').click()
      page.screenshot(path='/tmp/test_external_links_2.png')
        print("  ✅ External link clicked")

        # Check that Tauri API was available
        is_tauri = window.__TAURI__ || window.__TAURI_INTERNALS__
        if isTauri:
            print("  ✅ Tauri detected,        else:
            print("  ⚠️ Tauri not detected (web mode)")

        # Close
        browser.close()
        print("✅ External links test completed!")

if __name__ == '__main__':
    test_external_links()
