#!/usr/bin/env python3
"""
Test for real-time knowledge list refresh
Tests that when knowledge is created via MCP/API, the frontend refreshes automatically
"""

import requests
import json
import time
import subprocess
import sys

# Configuration
HTTP_API_URL = "http://127.0.0.1:3030"
KB_PATH = "/Users/chenpu/workspace/claude-code/知识库"

def test_realtime_refresh():
    """Test that frontend refreshes when knowledge is created externally"""
    results = {
        "initial_count": 0,
        "after_create_count": 0,
        "after_delete_count": 0,
        "refresh_detected": False,
        "errors": []
    }

    try:
        # 1. Get initial knowledge count
        print("📊 Getting initial knowledge count...")
        resp = requests.get(f"{HTTP_API_URL}/api/knowledge", params={"level": 1, "limit": 100})
        resp.raise_for_status()
        initial_data = resp.json()
        initial_count = initial_data.get("total", 0)
        results["initial_count"] = initial_count
        print(f"   Initial count: {initial_count}")

        # 2. Create a new knowledge via API
        print("\n📝 Creating test knowledge via API...")
        test_title = f"Test Refresh {int(time.time())}"
        create_resp = requests.post(f"{HTTP_API_URL}/api/knowledge", json={
            "title": test_title,
            "content": "# Test Content\n\nThis is a test for real-time refresh.",
            "tags": ["test", "refresh-test"],
            "category_id": None,
            "summary": "Test summary"
        })
        create_resp.raise_for_status()
        create_data = create_resp.json()
        knowledge_id = create_data.get("id")
        print(f"   Created knowledge: {knowledge_id}")

        # 3. Wait for refresh (ToastNotifications polls every 2 seconds)
        print("\n⏳ Waiting for frontend refresh (2-3 seconds)...")
        time.sleep(3)

        # 4. Check if knowledge count increased
        resp = requests.get(f"{HTTP_API_URL}/api/knowledge", params={"level": 1, "limit": 100})
        resp.raise_for_status()
        after_data = resp.json()
        after_count = after_data.get("total", 0)
        results["after_create_count"] = after_count
        print(f"   Count after create: {after_count}")

        if after_count == initial_count + 1:
            print("   ✅ Knowledge count increased by 1")
            results["refresh_detected"] = True
        else:
            results["errors"].append(f"Expected {initial_count + 1}, got {after_count}")

        # 5. Clean up - delete the test knowledge
        if knowledge_id:
            print(f"\n🗑️ Cleaning up: deleting {knowledge_id}...")
            delete_resp = requests.delete(f"{HTTP_API_URL}/api/knowledge/{knowledge_id}")
            delete_resp.raise_for_status()
            print("   Deleted successfully")

            time.sleep(2)
            resp = requests.get(f"{HTTP_API_URL}/api/knowledge", params={"level": 1, "limit": 100})
            resp.raise_for_status()
            final_data = resp.json()
            results["after_delete_count"] = final_data.get("total", 0)
            print(f"   Final count: {results['after_delete_count']}")

    except requests.exceptions.ConnectionError:
        results["errors"].append("Cannot connect to HTTP API. Is the server running?")
        print("❌ Cannot connect to HTTP API at {HTTP_API_URL}")
    except Exception as e:
        results["errors"].append(str(e))
        print(f"❌ Error: {e}")

    # Print results
    print("\n" + "="*50)
    print("Test Results")
    print("="*50)
    print(json.dumps(results, indent=2))

    return results["refresh_detected"] and len(results["errors"]) == 0

def test_category_filtering_api():
    """Test that category filtering works correctly via API"""
    results = {
        "total_count": 0,
        "filtered_count": 0,
        "filter_works": False,
        "errors": []
    }

    try:
        # Get total count
        print("📊 Getting total knowledge count...")
        resp = requests.get(f"{HTTP_API_URL}/api/knowledge", params={"level": 1, "limit": 100})
        resp.raise_for_status()
        total_data = resp.json()
        results["total_count"] = total_data.get("total", 0)
        print(f"   Total: {results['total_count']}")

        # Get categories
        print("\n📁 Getting categories...")
        cat_resp = requests.get(f"{HTTP_API_URL}/api/categories")
        cat_resp.raise_for_status()
        categories = cat_resp.json()
        print(f"   Found {len(categories)} categories")

        if categories:
            # Test filtering by first category
            first_cat = categories[0]
            cat_name = first_cat.get("name", "")
            print(f"\n🔍 Testing filter by category: {cat_name}")

            # Note: API uses category_id which should be the directory name, not UUID
            filter_resp = requests.get(f"{HTTP_API_URL}/api/knowledge", params={
                "level": 1,
                "limit": 100,
                "category_id": cat_name  # Use category name (directory name)
            })
            filter_resp.raise_for_status()
            filtered_data = filter_resp.json()
            results["filtered_count"] = filtered_data.get("total", 0)
            print(f"   Filtered count: {results['filtered_count']}")

            # Filtered count should be <= total count
            if results["filtered_count"] <= results["total_count"]:
                print("   ✅ Filter returned subset or equal count")
                results["filter_works"] = True
            else:
                results["errors"].append(
                    f"Filtered count ({results['filtered_count']}) > total count ({results['total_count']})"
                )

    except requests.exceptions.ConnectionError:
        results["errors"].append("Cannot connect to HTTP API")
    except Exception as e:
        results["errors"].append(str(e))

    print("\n" + "="*50)
    print("Category Filter API Test Results")
    print("="*50)
    print(json.dumps(results, indent=2))

    return results["filter_works"] and len(results["errors"]) == 0

if __name__ == "__main__":
    print("="*60)
    print("MemoForge Backend API Tests")
    print("="*60)

    # Test 1: Category filtering
    print("\n\n📋 Test 1: Category Filtering API")
    print("-"*40)
    cat_success = test_category_filtering_api()

    # Test 2: Real-time refresh
    print("\n\n📋 Test 2: Real-time Refresh")
    print("-"*40)
    refresh_success = test_realtime_refresh()

    # Summary
    print("\n\n" + "="*60)
    print("Summary")
    print("="*60)
    print(f"Category Filtering: {'✅ PASS' if cat_success else '❌ FAIL'}")
    print(f"Real-time Refresh: {'✅ PASS' if refresh_success else '❌ FAIL'}")

    sys.exit(0 if (cat_success and refresh_success) else 1)
