describe('Upload Workflow', () => {
  beforeEach(() => {
    cy.mockApiResponses()
    cy.login()
  })

  describe('File Upload Interface', () => {
    it('should display upload interface on dashboard', () => {
      cy.visit('/dashboard')
      
      cy.get('[data-testid="upload-section"]').should('be.visible')
      cy.get('[data-testid="file-upload-dropzone"]').should('be.visible')
      cy.get('[data-testid="camera-capture-button"]').should('be.visible')
    })

    it('should allow drag and drop file upload', () => {
      cy.visit('/dashboard')
      
      // Upload test image
      cy.uploadTestImage('test-notes.jpg')
      
      // Should show file preview
      cy.get('[data-testid="file-preview"]').should('be.visible')
      cy.get('[data-testid="file-name"]').should('contain', 'test-notes.jpg')
      
      // Should show upload button
      cy.get('[data-testid="start-upload-button"]').should('be.visible')
    })

    it('should validate file types and sizes', () => {
      cy.visit('/dashboard')
      
      // Try to upload invalid file type
      cy.fixture('invalid-file.txt', 'base64').then(fileContent => {
        cy.get('[data-testid="file-upload-dropzone"]').selectFile({
          contents: Cypress.Buffer.from(fileContent, 'base64'),
          fileName: 'invalid-file.txt',
          mimeType: 'text/plain'
        }, { action: 'drag-drop' })
      })
      
      cy.get('[data-testid="error-message"]')
        .should('contain', 'Only image files are allowed')
    })

    it('should allow multiple file selection', () => {
      cy.visit('/dashboard')
      
      // Upload multiple files
      cy.uploadTestImage('test-notes-1.jpg')
      cy.uploadTestImage('test-notes-2.jpg')
      
      cy.get('[data-testid="file-preview"]').should('have.length', 2)
      cy.get('[data-testid="file-count"]').should('contain', '2 files selected')
    })
  })

  describe('Upload Process', () => {
    it('should start processing after upload', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      
      cy.wait('@uploadFiles')
      
      // Should show processing status
      cy.get('[data-testid="processing-status"]').should('be.visible')
      cy.get('[data-testid="progress-bar"]').should('be.visible')
    })

    it('should show upload progress', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      
      cy.wait('@uploadFiles')
      
      // Should show progress stages
      cy.get('[data-testid="stage-upload"]').should('contain', 'Uploading')
      cy.get('[data-testid="stage-ocr"]').should('contain', 'Extracting text')
      cy.get('[data-testid="stage-clustering"]').should('contain', 'Analyzing content')
    })

    it('should handle upload errors gracefully', () => {
      cy.intercept('POST', '/api/upload', {
        statusCode: 500,
        body: { success: false, error: 'Upload failed' }
      }).as('uploadFailed')
      
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      
      cy.wait('@uploadFailed')
      
      cy.get('[data-testid="error-message"]')
        .should('contain', 'Upload failed')
      cy.get('[data-testid="retry-button"]').should('be.visible')
    })
  })

  describe('Camera Integration', () => {
    it('should show camera interface on mobile', () => {
      cy.viewport('iphone-x')
      cy.visit('/dashboard')
      
      cy.get('[data-testid="camera-capture-button"]').click()
      
      // Should show camera interface
      cy.get('[data-testid="camera-interface"]').should('be.visible')
      cy.get('[data-testid="capture-button"]').should('be.visible')
      cy.get('[data-testid="switch-camera-button"]').should('be.visible')
    })

    it('should allow photo capture', () => {
      cy.viewport('iphone-x')
      cy.visit('/dashboard')
      
      cy.get('[data-testid="camera-capture-button"]').click()
      cy.get('[data-testid="capture-button"]').click()
      
      // Should show captured image preview
      cy.get('[data-testid="captured-image"]').should('be.visible')
      cy.get('[data-testid="retake-button"]').should('be.visible')
      cy.get('[data-testid="use-photo-button"]').should('be.visible')
    })
  })

  describe('Accessibility', () => {
    it('should be accessible on upload page', () => {
      cy.visit('/dashboard')
      cy.checkAccessibility()
    })

    it('should support keyboard navigation', () => {
      cy.visit('/dashboard')
      
      // Tab through upload interface
      cy.get('body').tab()
      cy.focused().should('have.attr', 'data-testid', 'file-upload-dropzone')
      
      cy.focused().tab()
      cy.focused().should('have.attr', 'data-testid', 'camera-capture-button')
    })
  })
})