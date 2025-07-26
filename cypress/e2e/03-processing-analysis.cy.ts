describe('Processing and Analysis Workflow', () => {
  beforeEach(() => {
    cy.mockApiResponses()
    cy.login()
  })

  describe('OCR Processing', () => {
    it('should extract text from uploaded images', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.wait('@uploadFiles')
      
      // Wait for OCR processing
      cy.get('[data-testid="stage-ocr"]').should('contain', 'Extracting text')
      cy.waitForProcessingComplete()
      
      // Should show extracted text
      cy.get('[data-testid="extracted-text-section"]').should('be.visible')
      cy.get('[data-testid="text-block"]').should('have.length.greaterThan', 0)
    })

    it('should show confidence scores for extracted text', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      cy.get('[data-testid="text-block"]').first().within(() => {
        cy.get('[data-testid="confidence-score"]').should('be.visible')
        cy.get('[data-testid="confidence-score"]').should('contain', '%')
      })
    })

    it('should allow manual text correction', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      // Edit text block
      cy.get('[data-testid="text-block"]').first().click()
      cy.get('[data-testid="edit-text-input"]').clear().type('Corrected text')
      cy.get('[data-testid="save-text-button"]').click()
      
      cy.get('[data-testid="text-block"]').first()
        .should('contain', 'Corrected text')
    })
  })

  describe('Bounding Box Detection', () => {
    it('should show detected bounding boxes', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      cy.get('[data-testid="bounding-box-editor"]').should('be.visible')
      cy.get('[data-testid="bounding-box"]').should('have.length.greaterThan', 0)
    })

    it('should allow manual bounding box adjustment', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      // Select and resize bounding box
      cy.get('[data-testid="bounding-box"]').first().click()
      cy.get('[data-testid="resize-handle"]').should('be.visible')
      
      // Drag to resize
      cy.get('[data-testid="resize-handle"]')
        .trigger('mousedown')
        .trigger('mousemove', { clientX: 100, clientY: 100 })
        .trigger('mouseup')
      
      cy.get('[data-testid="save-changes-button"]').click()
      cy.get('[data-testid="success-message"]').should('contain', 'Changes saved')
    })

    it('should allow adding new bounding boxes', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      cy.get('[data-testid="add-bounding-box-button"]').click()
      
      // Draw new bounding box
      cy.get('[data-testid="image-canvas"]')
        .trigger('mousedown', { clientX: 50, clientY: 50 })
        .trigger('mousemove', { clientX: 150, clientY: 150 })
        .trigger('mouseup')
      
      cy.get('[data-testid="bounding-box"]').should('have.length.greaterThan', 1)
    })
  })

  describe('Semantic Clustering', () => {
    it('should group related content into themes', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      cy.get('[data-testid="clusters-section"]').should('be.visible')
      cy.get('[data-testid="cluster"]').should('have.length.greaterThan', 0)
      
      cy.get('[data-testid="cluster"]').first().within(() => {
        cy.get('[data-testid="cluster-label"]').should('be.visible')
        cy.get('[data-testid="cluster-notes"]').should('be.visible')
      })
    })

    it('should allow manual cluster reassignment', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      // Drag note to different cluster
      cy.get('[data-testid="note-item"]').first()
        .drag('[data-testid="cluster"]:last')
      
      cy.get('[data-testid="confirm-reassignment-button"]').click()
      cy.get('[data-testid="success-message"]').should('contain', 'Note reassigned')
    })

    it('should allow theme label editing', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      cy.get('[data-testid="cluster-label"]').first().click()
      cy.get('[data-testid="edit-label-input"]').clear().type('Custom Theme')
      cy.get('[data-testid="save-label-button"]').click()
      
      cy.get('[data-testid="cluster-label"]').first()
        .should('contain', 'Custom Theme')
    })
  })

  describe('Summary Generation', () => {
    it('should generate comprehensive summary', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      cy.get('[data-testid="summary-section"]').should('be.visible')
      cy.get('[data-testid="top-themes"]').should('be.visible')
      cy.get('[data-testid="theme-distribution"]').should('be.visible')
      cy.get('[data-testid="representative-quotes"]').should('be.visible')
    })

    it('should show theme percentages', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      cy.get('[data-testid="theme-percentage"]').should('have.length.greaterThan', 0)
      cy.get('[data-testid="theme-percentage"]').first().should('contain', '%')
    })

    it('should display representative quotes', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      cy.get('[data-testid="quote-item"]').should('have.length.greaterThan', 0)
      cy.get('[data-testid="quote-text"]').should('be.visible')
      cy.get('[data-testid="quote-theme"]').should('be.visible')
    })
  })

  describe('Error Handling', () => {
    it('should handle OCR processing errors', () => {
      cy.intercept('GET', '/api/processing/status/*', {
        statusCode: 500,
        body: { success: false, error: 'OCR processing failed' }
      }).as('processingError')
      
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      
      cy.wait('@processingError')
      
      cy.get('[data-testid="error-message"]')
        .should('contain', 'OCR processing failed')
      cy.get('[data-testid="retry-processing-button"]').should('be.visible')
    })

    it('should handle clustering failures gracefully', () => {
      cy.intercept('GET', '/api/processing/status/*', {
        body: {
          success: true,
          data: {
            status: 'failed',
            error: 'Clustering failed - insufficient text content'
          }
        }
      }).as('clusteringFailed')
      
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      
      cy.wait('@clusteringFailed')
      
      cy.get('[data-testid="error-message"]')
        .should('contain', 'Clustering failed')
      cy.get('[data-testid="manual-clustering-button"]').should('be.visible')
    })
  })

  describe('Accessibility', () => {
    it('should be accessible during processing', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      
      cy.checkAccessibility()
    })

    it('should announce processing status to screen readers', () => {
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      
      cy.get('[data-testid="processing-status"]')
        .should('have.attr', 'aria-live', 'polite')
      cy.get('[data-testid="progress-bar"]')
        .should('have.attr', 'role', 'progressbar')
    })
  })
})