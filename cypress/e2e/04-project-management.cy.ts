describe('Project Management', () => {
  beforeEach(() => {
    cy.mockApiResponses()
    cy.login()
  })

  describe('Project History', () => {
    it('should display list of past projects', () => {
      cy.visit('/projects')
      cy.wait('@getProjects')
      
      cy.get('[data-testid="project-list"]').should('be.visible')
      cy.get('[data-testid="project-card"]').should('have.length', 2)
      
      cy.get('[data-testid="project-card"]').first().within(() => {
        cy.get('[data-testid="project-name"]').should('contain', 'Meeting Notes - Q4 Planning')
        cy.get('[data-testid="project-date"]').should('be.visible')
        cy.get('[data-testid="project-status"]').should('contain', 'completed')
        cy.get('[data-testid="image-count"]').should('contain', '5 images')
      })
    })

    it('should allow filtering projects', () => {
      cy.visit('/projects')
      cy.wait('@getProjects')
      
      // Filter by status
      cy.get('[data-testid="status-filter"]').select('completed')
      cy.get('[data-testid="project-card"]').should('have.length', 2)
      
      // Filter by date range
      cy.get('[data-testid="date-from-input"]').type('2024-01-01')
      cy.get('[data-testid="date-to-input"]').type('2024-01-31')
      cy.get('[data-testid="apply-filters-button"]').click()
      
      cy.get('[data-testid="project-card"]').should('have.length', 2)
    })

    it('should allow searching projects', () => {
      cy.visit('/projects')
      cy.wait('@getProjects')
      
      cy.get('[data-testid="search-input"]').type('Meeting')
      cy.get('[data-testid="project-card"]').should('have.length', 1)
      cy.get('[data-testid="project-name"]').should('contain', 'Meeting Notes')
    })

    it('should support pagination', () => {
      // Mock response with more projects
      cy.intercept('GET', '/api/projects*', {
        body: {
          success: true,
          data: {
            projects: Array.from({ length: 10 }, (_, i) => ({
              id: `project-${i}`,
              name: `Project ${i}`,
              createdAt: '2024-01-15T10:00:00Z',
              status: 'completed',
              imageCount: 3
            })),
            pagination: {
              page: 1,
              limit: 10,
              total: 25,
              totalPages: 3
            }
          }
        }
      }).as('getProjectsPaginated')
      
      cy.visit('/projects')
      cy.wait('@getProjectsPaginated')
      
      cy.get('[data-testid="pagination"]').should('be.visible')
      cy.get('[data-testid="next-page-button"]').click()
      
      cy.url().should('include', 'page=2')
    })
  })

  describe('Project Details', () => {
    it('should display full project analysis', () => {
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="project-header"]').should('be.visible')
      cy.get('[data-testid="project-name"]').should('contain', 'Meeting Notes')
      
      cy.get('[data-testid="summary-section"]').should('be.visible')
      cy.get('[data-testid="clusters-section"]').should('be.visible')
      cy.get('[data-testid="images-section"]').should('be.visible')
    })

    it('should allow viewing original images', () => {
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="image-thumbnail"]').first().click()
      
      cy.get('[data-testid="image-modal"]').should('be.visible')
      cy.get('[data-testid="full-size-image"]').should('be.visible')
      cy.get('[data-testid="image-navigation"]').should('be.visible')
    })

    it('should show extracted text with bounding boxes', () => {
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="view-text-button"]').click()
      
      cy.get('[data-testid="text-overlay"]').should('be.visible')
      cy.get('[data-testid="bounding-box"]').should('have.length.greaterThan', 0)
      cy.get('[data-testid="extracted-text"]').should('be.visible')
    })
  })

  describe('Project Actions', () => {
    it('should allow project renaming', () => {
      cy.visit('/projects')
      cy.wait('@getProjects')
      
      cy.get('[data-testid="project-card"]').first().within(() => {
        cy.get('[data-testid="project-menu"]').click()
      })
      
      cy.get('[data-testid="rename-project-option"]').click()
      
      cy.get('[data-testid="rename-modal"]').should('be.visible')
      cy.get('[data-testid="project-name-input"]').clear().type('Renamed Project')
      cy.get('[data-testid="save-name-button"]').click()
      
      cy.wait('@updateProject')
      cy.get('[data-testid="success-message"]').should('contain', 'Project renamed')
    })

    it('should allow project deletion', () => {
      cy.visit('/projects')
      cy.wait('@getProjects')
      
      cy.get('[data-testid="project-card"]').first().within(() => {
        cy.get('[data-testid="project-menu"]').click()
      })
      
      cy.get('[data-testid="delete-project-option"]').click()
      
      cy.get('[data-testid="delete-confirmation-modal"]').should('be.visible')
      cy.get('[data-testid="confirm-delete-button"]').click()
      
      cy.wait('@deleteProject')
      cy.get('[data-testid="success-message"]').should('contain', 'Project deleted')
    })

    it('should allow project duplication', () => {
      cy.visit('/projects')
      cy.wait('@getProjects')
      
      cy.get('[data-testid="project-card"]').first().within(() => {
        cy.get('[data-testid="project-menu"]').click()
      })
      
      cy.get('[data-testid="duplicate-project-option"]').click()
      
      cy.get('[data-testid="duplicate-modal"]').should('be.visible')
      cy.get('[data-testid="new-project-name-input"]').type('Duplicated Project')
      cy.get('[data-testid="duplicate-button"]').click()
      
      cy.wait('@createProject')
      cy.get('[data-testid="success-message"]').should('contain', 'Project duplicated')
    })
  })

  describe('Export Functionality', () => {
    it('should export project as PDF', () => {
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="export-button"]').click()
      cy.get('[data-testid="export-pdf-option"]').click()
      
      cy.get('[data-testid="export-options-modal"]').should('be.visible')
      cy.get('[data-testid="include-summary-checkbox"]').check()
      cy.get('[data-testid="include-images-checkbox"]').check()
      cy.get('[data-testid="generate-pdf-button"]').click()
      
      cy.wait('@exportPdf')
      cy.get('[data-testid="download-link"]').should('be.visible')
    })

    it('should export project as CSV', () => {
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="export-button"]').click()
      cy.get('[data-testid="export-csv-option"]').click()
      
      cy.get('[data-testid="csv-options-modal"]').should('be.visible')
      cy.get('[data-testid="include-metadata-checkbox"]').check()
      cy.get('[data-testid="generate-csv-button"]').click()
      
      cy.wait('@exportCsv')
      cy.get('[data-testid="download-link"]').should('be.visible')
    })

    it('should handle export errors', () => {
      cy.intercept('POST', '/api/export/pdf', {
        statusCode: 500,
        body: { success: false, error: 'Export generation failed' }
      }).as('exportError')
      
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      cy.get('[data-testid="export-button"]').click()
      cy.get('[data-testid="export-pdf-option"]').click()
      cy.get('[data-testid="generate-pdf-button"]').click()
      
      cy.wait('@exportError')
      cy.get('[data-testid="error-message"]')
        .should('contain', 'Export generation failed')
    })
  })

  describe('Accessibility', () => {
    it('should be accessible on projects page', () => {
      cy.visit('/projects')
      cy.wait('@getProjects')
      cy.checkAccessibility()
    })

    it('should be accessible on project detail page', () => {
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      cy.checkAccessibility()
    })

    it('should support keyboard navigation in project list', () => {
      cy.visit('/projects')
      cy.wait('@getProjects')
      
      cy.get('[data-testid="project-card"]').first().focus()
      cy.focused().should('have.attr', 'data-testid', 'project-card')
      
      cy.focused().type('{enter}')
      cy.url().should('include', '/projects/project-1')
    })
  })
})