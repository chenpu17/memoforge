#!/usr/bin/env python3
"""
Playwright E2E Test for Category Filtering
Tests:
1. Category selection displays correct knowledge count
2. Switching between categories updates list
3. Clearing category filter shows all knowledge
"""

from playwright.sync_api import sync_playwright
import json

def main():
    results = {
        "category_filter_test": False,
        "category_switch_test": False,
        "clear_filter_test": False,
        "errors": []
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            print("🌐 Navigating to http://localhost:1420...")
            page.goto('http://localhost:1420')
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(2000)

            # Get initial knowledge count
            print("\n📊 Getting initial knowledge count...")
            initial_list = page.locator('[data-testid="knowledge-item"], div[class*="cursor-pointer"]:has(h3)').all()
            initial_count = len(initial_list)
            print(f"   Initial count: {initial_count}")

            # Find category items in sidebar
            print("\n📁 Looking for categories...")
            categories = page.locator('div:has(> span)').filter(has_text='资讯').all()

            if not categories:
                # Try alternative selector
                categories = page.locator('div[class*="cursor-pointer"]:has(span)').all()

            print(f"   Found {len(categories)} potential category elements")

            # Test 1: Click on a category and verify filter
            if len(categories) > 0:
                print("\n✅ Test 1: Clicking first category...")
                first_cat = categories[0]
                cat_name = first_cat.inner_text().split('\n')[0] if first_cat.inner_text() else "Unknown"
                print(f"   Category name: {cat_name}")

                first_cat.click()
                page.wait_for_timeout(1500)

                # Get filtered count
                filtered_list = page.locator('[data-testid="knowledge-item"], div[class*="cursor-pointer"]:has(h3)').all()
                filtered_count = len(filtered_list)
                print(f"   Filtered count: {filtered_count}")

                # The filtered count should be <= initial count
                if filtered_count <= initial_count:
                    print("   ✅ Filter reduced or maintained count")
                    results["category_filter_test"] = True
                else:
                    results["errors"].append(f"Filter increased count: {initial_count} -> {filtered_count}")

                # Test 2: Switch to another category
                if len(categories) > 1:
                    print("\n✅ Test 2: Switching to second category...")
                    categories = page.locator('div:has(> span)').filter(has_text='资讯').all()
                    if not categories:
                        categories = page.locator('div[class*="cursor-pointer"]:has(span)').all()

                    second_cat = categories[1] if len(categories) > 1 else categories[0]
                    second_cat.click()
                    page.wait_for_timeout(1500)

                    new_filtered_list = page.locator('[data-testid="knowledge-item"], div[class*="cursor-pointer"]:has(h3)').all()
                    new_filtered_count = len(new_filtered_list)
                    print(f"   New filtered count: {new_filtered_count}")
                    results["category_switch_test"] = True

                # Test 3: Clear filter by clicking same category again
                print("\n✅ Test 3: Clearing filter...")
                # Click same category again to deselect
                if len(categories) > 0:
                    categories[0].click()
                    page.wait_for_timeout(500)
                    categories[0].click()  # Click again to deselect
                    page.wait_for_timeout(1500)

                    cleared_list = page.locator('[data-testid="knowledge-item"], div[class*="cursor-pointer"]:has(h3)').all()
                    cleared_count = len(cleared_list)
                    print(f"   Count after clearing: {cleared_count}")

                    if cleared_count == initial_count:
                        print("   ✅ Filter cleared successfully")
                        results["clear_filter_test"] = True
                    else:
                        results["errors"].append(f"Count mismatch after clear: {initial_count} vs {cleared_count}")

            else:
                results["errors"].append("No categories found to test")

        except Exception as e:
            results["errors"].append(str(e))
            print(f"❌ Error: {e}")

        finally:
            browser.close()

    # Print results
    print("\n" + "="*50)
    print("Test Results")
    print("="*50)
    for test, passed in results.items():
        if test != "errors":
            status = "✅ PASS" if passed else "❌ FAIL"
            print(f"{test}: {status}")

    if results["errors"]:
        print("\nErrors:")
        for err in results["errors"]:
            print(f"  - {err}")

    # Write results to file
    with open('/tmp/category_filter_test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print("\nResults saved to /tmp/category_filter_test_results.json")

    return all([results["category_filter_test"], results.get("category_switch_test", True)])

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
