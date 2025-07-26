describe('Export Workflows', () => {
  beforeEach(() => {
    cy.mockApiResponses()
    cy.login()
  })

  describe('PDF Export', () => {
    it('should generate PDF with all content', () => {
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="export-button"]').click()
      cy.get('[data-testid="export-pdf-option"]').click()
      
      // Configure export options
      cy.get('[data-testid="include-summary-checkbox"]').check()
      cy.get('[data-testid="include-themes-checkbox"]').check()
      cy.get('[data-testid="include-quotes-checkbox"]').check()
      cy.get('[data-testid="include-images-checkbox"]').check()
      
      cy.get('[data-testid="generate-pdf-button"]').click()
      cy.wait('@exportPdf')
      
      // Should show download link
      cy.get('[data-testid="download-link"]').should('be.visible')
      cy.get('[data-testid="download-link"]').should('have.attr', 'href')
    })

    it('should allow custom PDF templates', () => {
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="export-button"]').click()
      cy.get('[data-testid="export-pdf-option"]').click()
      
      cy.get('[data-testid="template-selector"]').select('executive-summary')
      cy.get('[data-testid="custom-title-input"]').type('Executive Summary Report')
      
      cy.get('[data-testid="generate-pdf-button"]').click()
      cy.wait('@exportPdf')
      
      cy.get('[data-testid="success-message"]').should('contain', 'PDF generated')
    })

    it('should show PDF generation progress', () => {
      // Mock progressive responses
      cy.intercept('POST', '/api/export/pdf', (req) => {
        req.reply({
          statusCode: 202,
          body: { success: true, jobId: 'pdf-job-123' }
        })
      }).as('startPdfGeneration')
      
      cy.intercept('GET', '/api/export/status/pdf-job-123', {
        body: {
          success: true,
          data: { status: 'processing', progress: 50 }
        }
      }).as('pdfProgress')
      
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="export-button"]').click()
      cy.get('[data-testid="export-pdf-option"]').click()
      cy.get('[data-testid="generate-pdf-button"]').click()
      
      cy.wait('@startPdfGeneration')
      
      // Should show progress
      cy.get('[data-testid="export-progress"]').should('be.visible')
      cy.get('[data-testid="progress-bar"]').should('be.visible')
    })
  })

  describe('CSV Export', () => {
    it('should generate CSV with structured data', () => {
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="export-button"]').click()
      cy.get('[data-testid="export-csv-option"]').click()
      
      // Configure CSV options
      cy.get('[data-testid="include-metadata-checkbox"]').check()
      cy.get('[data-testid="include-confidence-scores-checkbox"]').check()
      cy.get('[data-testid="include-coordinates-checkbox"]').check()
      
      cy.get('[data-testid="generate-csv-button"]').click()
      cy.wait('@exportCsv')
      
      cy.get('[data-testid="download-link"]').should('be.visible')
    })

    it('should allow custom CSV column selection', () => {
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="export-button"]').click()
      cy.get('[data-testid="export-csv-option"]').click()
      
      // Select specific columns
      cy.get('[data-testid="column-selector"]').within(() => {
        cy.get('[data-testid="text-column"]').check()
        cy.get('[data-testid="theme-column"]').check()
        cy.get('[data-testid="confidence-column"]').check()
        cy.get('[data-testid="timestamp-column"]').uncheck()
      })
      
      cy.get('[data-testid="generate-csv-button"]').click()
      cy.wait('@exportCsv')
      
      cy.get('[data-testid="success-message"]').should('contain', 'CSV generated')
    })

    it('should handle large datasets efficiently', () => {
      // Mock large dataset response
      cy.intercept('GET', '/api/projects/project-large', {
        body: {
          success: true,
          data: {
            id: 'project-large',
            name: 'Large Dataset Project',
            notes: Array.from({ length: 1000 }, (_, i) => ({
              id: `note-${i}`,
              text: `Note ${i}`,
              theme: `Theme ${i % 10}`
            }))
          }
        }
      }).as('getLargeProject')
      
      cy.visit('/projects/project-large')
      cy.wait('@getLargeProject')
      
      cy.get('[data-testid="export-button"]').click()
      cy.get('[data-testid="export-csv-option"]').click()
      cy.get('[data-testid="generate-csv-button"]').click()
      
      // Should show processing indicator for large datasets
      cy.get('[data-testid="processing-large-dataset"]').should('be.visible')
      cy.wait('@exportCsv')
      
      cy.get('[data-testid="download-link"]').should('be.visible')
    })
  })

  describe('Batch Export', () => {
    it('should allow exporting multiple projects', () => {
      cy.visit('/projects')
      cy.wait('@getProjects')
      
      // Select multiple projects
      cy.get('[data-testid="project-checkbox"]').first().check()
      cy.get('[data-testid="project-checkbox"]').last().check()
      
      cy.get('[data-testid="batch-export-button"]').click()
      cy.get('[data-testid="export-format-selector"]').select('pdf')
      cy.get('[data-testid="start-batch-export-button"]').click()
      
      cy.get('[data-testid="batch-export-progress"]').should('be.visible')
      cy.get('[data-testid="export-queue"]').should('contain', '2 projects')
    })

    it('should show batch export progress', () => {
      cy.visit('/projects')
      cy.wait('@getProjects')
      
      cy.get('[data-testid="project-checkbox"]').first().check()
      cy.get('[data-testid="project-checkbox"]').last().check()
      
      cy.get('[data-testid="batch-export-button"]').click()
      cy.get('[data-testid="start-batch-export-button"]').click()
      
      // Should show individual project progress
      cy.get('[data-testid="project-export-status"]').should('have.length', 2)
      cy.get('[data-testid="overall-progress"]').should('be.visible')
    })
  })

  describe('Export History', () => {
    it('should track export history', () => {
      cy.visit('/exports')
      
      cy.get('[data-testid="export-history"]').should('be.visible')
      cy.get('[data-testid="export-item"]').should('have.length.greaterThan', 0)
      
      cy.get('[data-testid="export-item"]').first().within(() => {
        cy.get('[data-testid="export-date"]').should('be.visible')
        cy.get('[data-testid="export-format"]').should('be.visible')
        cy.get('[data-testid="export-status"]').should('be.visible')
        cy.get('[data-testid="download-again-button"]').should('be.visible')
      })
    })

    it('should allow re-downloading previous exports', () => {
      cy.visit('/exports')
      
      cy.get('[data-testid="export-item"]').first().within(() => {
        cy.get('[data-testid="download-again-button"]').click()
      })
      
      // Should trigger download
      cy.get('[data-testid="download-started-message"]').should('be.visible')
    })
  })

  describe('Error Handling', () => {
    it('should handle export service unavailable', () => {
      cy.intercept('POST', '/api/export/pdf', {
        statusCode: 503,
        body: { success: false, error: 'Export service temporarily unavailable' }
      }).as('exportServiceDown')
      
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="export-button"]').click()
      cy.get('[data-testid="export-pdf-option"]').click()
      cy.get('[data-testid="generate-pdf-button"]').click()
      
      cy.wait('@exportServiceDown')
      
      cy.get('[data-testid="error-message"]')
        .should('contain', 'Export service temporarily unavailable')
      cy.get('[data-testid="retry-later-button"]').should('be.visible')
    })

    it('should handle export timeout', () => {
      cy.intercept('POST', '/api/export/pdf', {
        statusCode: 408,
        body: { success: false, error: 'Export generation timed out' }
      }).as('exportTimeout')
      
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="export-button"]').click()
      cy.get('[data-testid="export-pdf-option"]').click()
      cy.get('[data-testid="generate-pdf-button"]').click()
      
      cy.wait('@exportTimeout')
      
      cy.get('[data-testid="error-message"]')
        .should('contain', 'Export generation timed out')
      cy.get('[data-testid="try-again-button"]').should('be.visible')
    })
  })

  describe('Accessibility', () => {
    it('should be accessible on export pages', () => {
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="export-button"]').click()
      cy.checkAccessibility()
    })

    it('should announce export progress to screen readers', () => {
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="export-button"]').click()
      cy.get('[data-testid="export-pdf-option"]').click()
      cy.get('[data-testid="generate-pdf-button"]').click()
      
      cy.get('[data-testid="export-progress"]')
        .should('have.attr', 'aria-live', 'polite')
      cy.get('[data-testid="progress-bar"]')
        .should('have.attr', 'role', 'progressbar')
    })
  })
})