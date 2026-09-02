from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""
Test suite for Documents Module API
Tests: DDT generation, CRUD operations, progressive numbering, status workflow, permissions
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD
EXISTING_CLIENT_ID = "eab85d0f-45c0-458f-ab88-08c442810aff"
EXISTING_ORDER_ID = "fae17ce1-5152-4ec6-96a4-6bdb51f61b33"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Headers with admin auth"""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="module")
def cleaner_token():
    """Get cleaner auth token for permission tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "maria.bianchi@kilolava.com",
        "password": TEST_FIXTURE_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip("Cleaner user not available for permission tests")
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def cleaner_headers(cleaner_token):
    """Headers with cleaner auth"""
    return {
        "Authorization": f"Bearer {cleaner_token}",
        "Content-Type": "application/json"
    }


class TestDocumentsListEndpoint:
    """Tests for GET /api/documents - list documents with filters"""
    
    def test_list_documents_success(self, admin_headers):
        """List documents returns 200 and paginated response"""
        response = requests.get(f"{BASE_URL}/api/documents", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)
        print(f"Found {data['total']} documents")
    
    def test_list_documents_filter_by_type(self, admin_headers):
        """Filter documents by type (ddt)"""
        response = requests.get(f"{BASE_URL}/api/documents", 
                               params={"document_type": "ddt"},
                               headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        for doc in data["items"]:
            assert doc["document_type"] == "ddt"
        print(f"Found {len(data['items'])} DDT documents")
    
    def test_list_documents_filter_by_status(self, admin_headers):
        """Filter documents by status (draft)"""
        response = requests.get(f"{BASE_URL}/api/documents", 
                               params={"status": "draft"},
                               headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        for doc in data["items"]:
            assert doc["status"] == "draft"
        print(f"Found {len(data['items'])} draft documents")
    
    def test_list_documents_filter_by_client(self, admin_headers):
        """Filter documents by client_id"""
        response = requests.get(f"{BASE_URL}/api/documents", 
                               params={"client_id": EXISTING_CLIENT_ID},
                               headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        for doc in data["items"]:
            assert doc["client_id"] == EXISTING_CLIENT_ID
        print(f"Found {len(data['items'])} documents for client")
    
    def test_list_documents_date_range_filter(self, admin_headers):
        """Filter documents by date range"""
        response = requests.get(f"{BASE_URL}/api/documents", 
                               params={"date_from": "2026-01-01", "date_to": "2026-12-31"},
                               headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        print(f"Found {len(data['items'])} documents in date range")
    
    def test_list_documents_search(self, admin_headers):
        """Search documents by number, client, notes"""
        response = requests.get(f"{BASE_URL}/api/documents", 
                               params={"search": "DDT"},
                               headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        print(f"Found {len(data['items'])} documents matching 'DDT'")
    
    def test_list_documents_pagination(self, admin_headers):
        """Test pagination with skip and limit"""
        response = requests.get(f"{BASE_URL}/api/documents", 
                               params={"skip": 0, "limit": 5},
                               headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) <= 5
        print(f"Pagination: {len(data['items'])} items returned, total: {data['total']}")


class TestDocumentsCRUD:
    """Tests for document CRUD operations"""
    
    created_doc_id = None
    
    def test_create_document_success(self, admin_headers):
        """Create a new DDT document"""
        payload = {
            "document_type": "ddt",
            "client_id": EXISTING_CLIENT_ID,
            "destination_address": "Via Test 123, Roma",
            "items": [
                {"description": "TEST_Kit biancheria doppio", "quantity": 2, "unit": "pz"},
                {"description": "TEST_Asciugamani set", "quantity": 4, "unit": "pz"}
            ],
            "notes": "TEST_Documento di test",
            "delivery_ref": "TEST_CONSEGNA_001"
        }
        response = requests.post(f"{BASE_URL}/api/documents", json=payload, headers=admin_headers)
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data
        assert "document_number" in data
        assert data["document_type"] == "ddt"
        assert data["status"] == "draft"
        assert data["client_id"] == EXISTING_CLIENT_ID
        assert len(data["items"]) == 2
        
        # Verify progressive numbering format: DDT-YYYY-NNNN
        assert data["document_number"].startswith("DDT-2026-")
        
        TestDocumentsCRUD.created_doc_id = data["id"]
        print(f"Created document: {data['document_number']}")
    
    def test_get_document_by_id(self, admin_headers):
        """Get single document by ID"""
        assert TestDocumentsCRUD.created_doc_id, "No document created"
        response = requests.get(f"{BASE_URL}/api/documents/{TestDocumentsCRUD.created_doc_id}", 
                               headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == TestDocumentsCRUD.created_doc_id
        assert "document_number" in data
        assert "items" in data
        print(f"Retrieved document: {data['document_number']}")
    
    def test_update_document_draft(self, admin_headers):
        """Update document in draft status"""
        assert TestDocumentsCRUD.created_doc_id, "No document created"
        payload = {
            "destination_address": "Via Aggiornata 456, Milano",
            "notes": "TEST_Note aggiornate",
            "items": [
                {"description": "TEST_Kit biancheria doppio", "quantity": 3, "unit": "pz"},
                {"description": "TEST_Asciugamani set", "quantity": 6, "unit": "pz"},
                {"description": "TEST_Nuovo articolo", "quantity": 1, "unit": "pz"}
            ]
        }
        response = requests.put(f"{BASE_URL}/api/documents/{TestDocumentsCRUD.created_doc_id}", 
                               json=payload, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["destination_address"] == "Via Aggiornata 456, Milano"
        assert len(data["items"]) == 3
        print(f"Updated document: {data['document_number']}")
    
    def test_get_document_not_found(self, admin_headers):
        """Get non-existent document returns 404"""
        response = requests.get(f"{BASE_URL}/api/documents/non-existent-id", headers=admin_headers)
        assert response.status_code == 404


class TestDocumentStatusWorkflow:
    """Tests for document status transitions"""
    
    def test_change_status_to_generated(self, admin_headers):
        """Change status from draft to generated"""
        assert TestDocumentsCRUD.created_doc_id, "No document created"
        payload = {"status": "generated"}
        response = requests.put(f"{BASE_URL}/api/documents/{TestDocumentsCRUD.created_doc_id}", 
                               json=payload, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "generated"
        print(f"Status changed to: {data['status']}")
    
    def test_change_status_to_delivered(self, admin_headers):
        """Change status from generated to delivered"""
        assert TestDocumentsCRUD.created_doc_id, "No document created"
        payload = {"status": "delivered"}
        response = requests.put(f"{BASE_URL}/api/documents/{TestDocumentsCRUD.created_doc_id}", 
                               json=payload, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "delivered"
        print(f"Status changed to: {data['status']}")
    
    def test_change_status_to_archived(self, admin_headers):
        """Change status from delivered to archived"""
        assert TestDocumentsCRUD.created_doc_id, "No document created"
        payload = {"status": "archived"}
        response = requests.put(f"{BASE_URL}/api/documents/{TestDocumentsCRUD.created_doc_id}", 
                               json=payload, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "archived"
        print(f"Status changed to: {data['status']}")


class TestDocumentDelete:
    """Tests for document deletion"""
    
    def test_delete_non_draft_fails(self, admin_headers):
        """Cannot delete document that is not in draft status"""
        assert TestDocumentsCRUD.created_doc_id, "No document created"
        response = requests.delete(f"{BASE_URL}/api/documents/{TestDocumentsCRUD.created_doc_id}", 
                                  headers=admin_headers)
        assert response.status_code == 400
        assert "bozza" in response.json().get("detail", "").lower()
        print("Correctly rejected deletion of non-draft document")
    
    def test_delete_draft_document(self, admin_headers):
        """Create and delete a draft document"""
        # Create a new draft document
        payload = {
            "document_type": "ddt",
            "items": [{"description": "TEST_Delete item", "quantity": 1, "unit": "pz"}],
            "notes": "TEST_Document to delete"
        }
        create_response = requests.post(f"{BASE_URL}/api/documents", json=payload, headers=admin_headers)
        assert create_response.status_code == 200
        doc_id = create_response.json()["id"]
        
        # Delete it
        delete_response = requests.delete(f"{BASE_URL}/api/documents/{doc_id}", headers=admin_headers)
        assert delete_response.status_code == 200
        
        # Verify it's gone
        get_response = requests.get(f"{BASE_URL}/api/documents/{doc_id}", headers=admin_headers)
        assert get_response.status_code == 404
        print("Successfully deleted draft document")


class TestDocumentGeneration:
    """Tests for generating documents from other entities"""
    
    def test_generate_from_order(self, admin_headers):
        """Generate DDT from existing order"""
        response = requests.post(f"{BASE_URL}/api/documents/generate-from-order/{EXISTING_ORDER_ID}", 
                                headers=admin_headers)
        # May return 404 if order doesn't exist, which is acceptable
        if response.status_code == 404:
            print("Order not found - skipping generate-from-order test")
            pytest.skip("Order not found")
        assert response.status_code == 200
        data = response.json()
        assert data["order_id"] == EXISTING_ORDER_ID
        assert data["document_type"] == "ddt"
        print(f"Generated DDT from order: {data['document_number']}")
    
    def test_generate_from_logistics_not_found(self, admin_headers):
        """Generate from non-existent logistics task returns 404"""
        response = requests.post(f"{BASE_URL}/api/documents/generate-from-logistics/non-existent-id", 
                                headers=admin_headers)
        assert response.status_code == 404
    
    def test_generate_from_movement_not_found(self, admin_headers):
        """Generate from non-existent movement returns 404"""
        response = requests.post(f"{BASE_URL}/api/documents/generate-from-movement/non-existent-id", 
                                headers=admin_headers)
        assert response.status_code == 404


class TestDocumentPermissions:
    """Tests for permission checks - only admin/ops_manager allowed"""
    
    def test_list_documents_requires_ops_role(self, cleaner_headers):
        """Cleaner cannot list documents"""
        response = requests.get(f"{BASE_URL}/api/documents", headers=cleaner_headers)
        assert response.status_code == 403
        print("Correctly denied cleaner access to list documents")
    
    def test_create_document_requires_ops_role(self, cleaner_headers):
        """Cleaner cannot create documents"""
        payload = {
            "document_type": "ddt",
            "items": [{"description": "Test", "quantity": 1, "unit": "pz"}]
        }
        response = requests.post(f"{BASE_URL}/api/documents", json=payload, headers=cleaner_headers)
        assert response.status_code == 403
        print("Correctly denied cleaner access to create documents")
    
    def test_get_document_requires_ops_role(self, cleaner_headers):
        """Cleaner cannot get document details"""
        assert TestDocumentsCRUD.created_doc_id, "No document created"
        response = requests.get(f"{BASE_URL}/api/documents/{TestDocumentsCRUD.created_doc_id}", 
                               headers=cleaner_headers)
        assert response.status_code == 403
        print("Correctly denied cleaner access to get document")
    
    def test_update_document_requires_ops_role(self, cleaner_headers):
        """Cleaner cannot update documents"""
        assert TestDocumentsCRUD.created_doc_id, "No document created"
        payload = {"notes": "Hacked notes"}
        response = requests.put(f"{BASE_URL}/api/documents/{TestDocumentsCRUD.created_doc_id}", 
                               json=payload, headers=cleaner_headers)
        assert response.status_code == 403
        print("Correctly denied cleaner access to update document")
    
    def test_delete_document_requires_ops_role(self, cleaner_headers):
        """Cleaner cannot delete documents"""
        assert TestDocumentsCRUD.created_doc_id, "No document created"
        response = requests.delete(f"{BASE_URL}/api/documents/{TestDocumentsCRUD.created_doc_id}", 
                                  headers=cleaner_headers)
        assert response.status_code == 403
        print("Correctly denied cleaner access to delete document")
    
    def test_generate_from_order_requires_ops_role(self, cleaner_headers):
        """Cleaner cannot generate documents from orders"""
        response = requests.post(f"{BASE_URL}/api/documents/generate-from-order/{EXISTING_ORDER_ID}", 
                                headers=cleaner_headers)
        assert response.status_code == 403
        print("Correctly denied cleaner access to generate from order")


class TestDocumentNumbering:
    """Tests for progressive document numbering"""
    
    def test_progressive_numbering(self, admin_headers):
        """Verify progressive numbering increments correctly"""
        # Create first document
        payload1 = {
            "document_type": "internal_movement",
            "items": [{"description": "TEST_Numbering test 1", "quantity": 1, "unit": "pz"}]
        }
        response1 = requests.post(f"{BASE_URL}/api/documents", json=payload1, headers=admin_headers)
        assert response1.status_code == 200
        doc1 = response1.json()
        
        # Create second document
        payload2 = {
            "document_type": "internal_movement",
            "items": [{"description": "TEST_Numbering test 2", "quantity": 1, "unit": "pz"}]
        }
        response2 = requests.post(f"{BASE_URL}/api/documents", json=payload2, headers=admin_headers)
        assert response2.status_code == 200
        doc2 = response2.json()
        
        # Verify numbering format and increment
        assert doc1["document_number"].startswith("INTERNAL_MOVEMENT-2026-")
        assert doc2["document_number"].startswith("INTERNAL_MOVEMENT-2026-")
        
        # Extract sequence numbers
        seq1 = int(doc1["document_number"].split("-")[-1])
        seq2 = int(doc2["document_number"].split("-")[-1])
        assert seq2 == seq1 + 1, f"Expected {seq1 + 1}, got {seq2}"
        
        print(f"Progressive numbering verified: {doc1['document_number']} -> {doc2['document_number']}")
        
        # Cleanup - delete both draft documents
        requests.delete(f"{BASE_URL}/api/documents/{doc1['id']}", headers=admin_headers)
        requests.delete(f"{BASE_URL}/api/documents/{doc2['id']}", headers=admin_headers)


class TestDocumentTypes:
    """Tests for different document types"""
    
    def test_create_internal_movement(self, admin_headers):
        """Create internal movement document"""
        payload = {
            "document_type": "internal_movement",
            "destination_address": "Magazzino centrale",
            "items": [{"description": "TEST_Internal item", "quantity": 5, "unit": "pz"}],
            "notes": "TEST_Movimento interno"
        }
        response = requests.post(f"{BASE_URL}/api/documents", json=payload, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["document_type"] == "internal_movement"
        assert data["document_number"].startswith("INTERNAL_MOVEMENT-")
        print(f"Created internal movement: {data['document_number']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/documents/{data['id']}", headers=admin_headers)
    
    def test_create_invoice_ref(self, admin_headers):
        """Create invoice reference document"""
        payload = {
            "document_type": "invoice_ref",
            "client_id": EXISTING_CLIENT_ID,
            "items": [{"description": "TEST_Invoice item", "quantity": 1, "unit": "pz"}],
            "notes": "TEST_Riferimento fattura"
        }
        response = requests.post(f"{BASE_URL}/api/documents", json=payload, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["document_type"] == "invoice_ref"
        assert data["document_number"].startswith("INVOICE_REF-")
        print(f"Created invoice ref: {data['document_number']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/documents/{data['id']}", headers=admin_headers)


class TestDocumentResponseStructure:
    """Tests for document response structure"""
    
    def test_document_response_has_all_fields(self, admin_headers):
        """Verify document response has all required fields"""
        response = requests.get(f"{BASE_URL}/api/documents", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        
        if data["items"]:
            doc = data["items"][0]
            required_fields = [
                "id", "document_number", "document_type", "status", 
                "issue_date", "items", "created_at", "updated_at"
            ]
            for field in required_fields:
                assert field in doc, f"Missing field: {field}"
            print(f"Document response has all required fields")
    
    def test_document_items_structure(self, admin_headers):
        """Verify document items have correct structure"""
        # Create document with items
        payload = {
            "document_type": "ddt",
            "items": [
                {"description": "TEST_Item 1", "quantity": 2, "unit": "pz", "notes": "Note 1"},
                {"description": "TEST_Item 2", "quantity": 3, "unit": "kg"}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/documents", json=payload, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["items"]) == 2
        item = data["items"][0]
        assert "description" in item
        assert "quantity" in item
        assert "unit" in item
        print(f"Document items structure verified")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/documents/{data['id']}", headers=admin_headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
