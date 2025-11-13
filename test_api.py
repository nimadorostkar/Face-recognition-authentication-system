# Example test script
# Save as test_api.py and run with: python test_api.py

import requests
import base64
import sys
from pathlib import Path

API_URL = "http://localhost:8000"

def encode_image(image_path):
    """Encode image to base64."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def test_health():
    """Test health endpoint."""
    print("🔍 Testing health endpoint...")
    response = requests.get(f"{API_URL}/health")
    if response.status_code == 200:
        print("✓ Health check passed")
        print(f"  {response.json()}")
    else:
        print(f"✗ Health check failed: {response.status_code}")
    print()

def test_register(name, image_path):
    """Test user registration."""
    print(f"📝 Registering user: {name}")
    
    if not Path(image_path).exists():
        print(f"✗ Image file not found: {image_path}")
        return None
    
    img_base64 = encode_image(image_path)
    response = requests.post(
        f"{API_URL}/register/",
        json={"name": name, "image": img_base64}
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"✓ Registration successful")
        print(f"  User ID: {result['user_id']}")
        print(f"  Name: {result['name']}")
        return result['user_id']
    else:
        print(f"✗ Registration failed: {response.status_code}")
        print(f"  {response.json()}")
        return None
    print()

def test_recognize(image_path):
    """Test face recognition."""
    print(f"🔎 Recognizing face...")
    
    if not Path(image_path).exists():
        print(f"✗ Image file not found: {image_path}")
        return
    
    img_base64 = encode_image(image_path)
    response = requests.post(
        f"{API_URL}/recognize/",
        json={"image": img_base64}
    )
    
    if response.status_code == 200:
        result = response.json()
        if result['match']:
            print(f"✓ Face recognized!")
            print(f"  Name: {result['name']}")
            print(f"  Distance: {result['distance']}")
            print(f"  Confidence: {result['confidence']}")
        else:
            print(f"✗ No match found")
    else:
        print(f"✗ Recognition failed: {response.status_code}")
        print(f"  {response.json()}")
    print()

def test_list_users():
    """Test list users endpoint."""
    print("📋 Listing users...")
    response = requests.get(f"{API_URL}/users/")
    
    if response.status_code == 200:
        users = response.json()
        print(f"✓ Found {len(users)} user(s)")
        for user in users:
            print(f"  - {user['name']} (ID: {user['id']})")
    else:
        print(f"✗ List users failed: {response.status_code}")
    print()

def test_stats():
    """Test stats endpoint."""
    print("📊 Getting system stats...")
    response = requests.get(f"{API_URL}/stats/")
    
    if response.status_code == 200:
        stats = response.json()
        print(f"✓ System statistics:")
        print(f"  Total users: {stats['total_users']}")
        print(f"  Database: {stats['database']}")
        print(f"  Model: {stats['embedding_model']}")
    else:
        print(f"✗ Stats failed: {response.status_code}")
    print()

if __name__ == "__main__":
    print("=" * 60)
    print("Face Recognition API Test Script")
    print("=" * 60)
    print()
    
    # Test health
    test_health()
    
    # Test with your images (replace with actual image paths)
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        
        # Register a user
        user_id = test_register("Test User", image_path)
        
        # List users
        test_list_users()
        
        # Recognize the same face
        if user_id:
            test_recognize(image_path)
        
        # Get stats
        test_stats()
    else:
        print("Usage: python test_api.py <path_to_face_image>")
        print()
        print("Example:")
        print("  python test_api.py face.jpg")
        print()
        print("You can still test the health endpoint:")
        test_health()
        test_list_users()
        test_stats()

