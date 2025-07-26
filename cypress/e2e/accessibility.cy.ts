describe('Accessibility Compliance', () => {
  beforeEach(() => {
    cy.mockApiResponses()
    cy.injectAxe()
  })

  describe('WCAG 2.1 AA Compliance', () => {
    it('should meet accessibility standards on login page', () => {
      cy.visit('/login')
      cy.checkA11y()
      
      // Test specific accessibility features
      cy.checkColorContrast()
      cy.checkKeyboardNavigation()
      cy.checkScreenReaderSupport()
      cy.checkFocusManagement()
    })

    it('should meet accessibility standards on registration page', () => {
      cy.visit('/register')
      cy.checkA11y()
      
      // Test form accessibility
      cy.get('input').each(($input) => {
        cy.wrap($input).should('have.attr', 'aria-label').or('have.attr', 'aria-labelledby')
      })
      
      // Test error message accessibility
      cy.get('[data-testid="register-button"]').click()
      cy.get('[role="alert"]').should('exist')
      cy.get('[aria-describedby]').should('exist')
    })

    it('should meet accessibility standards on dashboard', () => {
      cy.login()
      cy.visit('/dashboard')
      cy.checkA11y()
      
      // Test upload interface accessibility
      cy.get('[data-testid="file-upload-dropzone"]')
        .should('have.attr', 'role', 'button')
        .should('have.attr', 'aria-label')
        .should('have.attr', 'tabindex', '0')
      
      // Test keyboard interaction
      cy.get('[data-testid="file-upload-dropzone"]').focus().type('{enter}')
    })

    it('should meet accessibility standards during processing', () => {
      cy.login()
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      
      cy.checkA11y()
      
      // Test progress indicators
      cy.get('[role="progressbar"]').should('exist')
      cy.get('[aria-live="polite"]').should('exist')
      
      // Test status announcements
      cy.get('[data-testid="processing-status"]')
        .should('have.attr', 'aria-live', 'polite')
    })

    it('should meet accessibility standards on results page', () => {
      cy.login()
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      cy.checkA11y()
      
      // Test results accessibility
      cy.get('[data-testid="clusters-section"]')
        .should('have.attr', 'role', 'region')
        .should('have.attr', 'aria-label')
      
      // Test interactive elements
      cy.get('[data-testid="cluster-label"]').each(($label) => {
        cy.wrap($label).should('be.focusable')
      })
    })

    it('should meet accessibility standards on projects page', () => {
      cy.login()
      cy.visit('/projects')
      cy.wait('@getProjects')
      
      cy.checkA11y()
      
      // Test project cards accessibility
      cy.get('[data-testid="project-card"]').each(($card) => {
        cy.wrap($card)
          .should('have.attr', 'role', 'article')
          .should('have.attr', 'aria-labelledby')
      })
      
      // Test pagination accessibility
      cy.get('[data-testid="pagination"]')
        .should('have.attr', 'role', 'navigation')
        .should('have.attr', 'aria-label', 'Pagination')
    })
  })

  describe('Keyboard Navigation', () => {
    it('should support full keyboard navigation on login', () => {
      cy.visit('/login')
      
      // Tab through all interactive elements
      cy.get('body').tab()
      cy.focused().should('have.attr', 'data-testid', 'email-input')
      
      cy.focused().tab()
      cy.focused().should('have.attr', 'data-testid', 'password-input')
      
      cy.focused().tab()
      cy.focused().should('have.attr', 'data-testid', 'login-button')
      
      // Test form submission with Enter
      cy.get('[data-testid="email-input"]').type('test@example.com')
      cy.get('[data-testid="password-input"]').type('testpassword123{enter}')
      
      cy.wait('@login')
    })

    it('should support keyboard navigation in upload interface', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Test dropzone keyboard interaction
      cy.get('[data-testid="file-upload-dropzone"]').focus()
      cy.focused().type('{enter}')
      
      // Test camera button keyboard interaction
      cy.get('[data-testid="camera-capture-button"]').focus()
      cy.focused().type(' ') // Space bar activation
    })

    it('should support keyboard navigation in results', () => {
      cy.login()
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      // Test cluster navigation
      cy.get('[data-testid="cluster-label"]').first().focus()
      cy.focused().type('{enter}')
      
      // Test note selection
      cy.get('[data-testid="note-item"]').first().focus()
      cy.focused().type(' ') // Space to select
    })

    it('should support keyboard shortcuts', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Test global shortcuts
      cy.get('body').type('{ctrl+u}') // Upload shortcut
      cy.get('[data-testid="file-upload-dropzone"]').should('be.focused')
      
      cy.get('body').type('{esc}') // Escape to close
      cy.get('[data-testid="file-upload-dropzone"]').should('not.be.focused')
    })
  })

  describe('Screen Reader Support', () => {
    it('should provide proper ARIA labels and descriptions', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Test upload area
      cy.get('[data-testid="file-upload-dropzone"]')
        .should('have.attr', 'aria-label')
        .should('have.attr', 'aria-describedby')
      
      // Test buttons
      cy.get('button').each(($button) => {
        cy.wrap($button).should('have.attr', 'aria-label').or('contain.text')
      })
      
      // Test form inputs
      cy.get('input').each(($input) => {
        cy.wrap($input).should('have.attr', 'aria-label').or('have.attr', 'aria-labelledby')
      })
    })

    it('should announce dynamic content changes', () => {
      cy.login()
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      
      // Test live regions
      cy.get('[aria-live="polite"]').should('exist')
      cy.get('[aria-live="assertive"]').should('exist')
      
      // Test status updates
      cy.get('[data-testid="processing-status"]')
        .should('have.attr', 'aria-live', 'polite')
    })

    it('should provide proper heading structure', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Test heading hierarchy
      cy.get('h1').should('have.length', 1)
      cy.get('h1').should('contain', 'Dashboard')
      
      cy.get('h2').should('exist')
      cy.get('h2').first().should('contain', 'Upload')
      
      // Test heading order
      cy.checkScreenReaderSupport()
    })

    it('should provide skip links', () => {
      cy.visit('/login')
      
      // Test skip link
      cy.get('a[href="#main"]').should('exist')
      cy.get('a[href="#main"]').focus()
      cy.focused().type('{enter}')
      cy.get('#main').should('be.focused')
    })
  })

  describe('Color and Contrast', () => {
    it('should meet color contrast requirements', () => {
      cy.visit('/login')
      cy.checkColorContrast()
      
      cy.login()
      cy.visit('/dashboard')
      cy.checkColorContrast()
      
      cy.visit('/projects')
      cy.wait('@getProjects')
      cy.checkColorContrast()
    })

    it('should not rely solely on color for information', () => {
      cy.login()
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      // Test that status is conveyed through text, not just color
      cy.get('[data-testid="processing-status"]').should('contain.text')
      
      // Test that themes have text labels, not just colors
      cy.get('[data-testid="cluster"]').each(($cluster) => {
        cy.wrap($cluster).find('[data-testid="cluster-label"]').should('contain.text')
      })
    })

    it('should support high contrast mode', () => {
      // Simulate high contrast mode
      cy.visit('/login', {
        onBeforeLoad: (win) => {
          win.matchMedia = cy.stub().returns({
            matches: true,
            addListener: () => {},
            removeListener: () => {}
          })
        }
      })
      
      cy.get('body').should('have.class', 'high-contrast')
      cy.checkColorContrast()
    })
  })

  describe('Focus Management', () => {
    it('should manage focus properly in modals', () => {
      cy.login()
      cy.visit('/projects')
      cy.wait('@getProjects')
      
      // Open modal
      cy.get('[data-testid="project-card"]').first().within(() => {
        cy.get('[data-testid="project-menu"]').click()
      })
      cy.get('[data-testid="rename-project-option"]').click()
      
      // Focus should be in modal
      cy.get('[role="dialog"]').should('be.visible')
      cy.focused().should('be.within', '[role="dialog"]')
      
      // Test focus trapping
      cy.checkFocusManagement()
      
      // Close modal and test focus restoration
      cy.get('[data-testid="cancel-button"]').click()
      cy.get('[role="dialog"]').should('not.exist')
    })

    it('should provide visible focus indicators', () => {
      cy.visit('/login')
      
      cy.get('button, a, input').each(($el) => {
        cy.wrap($el).focus()
        cy.focused().should('have.css', 'outline-width').and('not.equal', '0px')
      })
    })

    it('should handle focus on dynamic content', () => {
      cy.login()
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      // Focus should move to results
      cy.get('[data-testid="results-section"]').should('be.focused')
    })
  })

  describe('Mobile Accessibility', () => {
    it('should be accessible on mobile devices', () => {
      cy.viewport('iphone-x')
      cy.visit('/login')
      cy.checkA11y()
      
      // Test touch targets
      cy.get('button, a').each(($el) => {
        const rect = $el[0].getBoundingClientRect()
        expect(rect.width).to.be.at.least(44) // Minimum touch target size
        expect(rect.height).to.be.at.least(44)
      })
    })

    it('should support mobile screen readers', () => {
      cy.viewport('iphone-x')
      cy.login()
      cy.visit('/dashboard')
      
      // Test mobile-specific ARIA attributes
      cy.get('[data-testid="camera-capture-button"]')
        .should('have.attr', 'aria-label')
        .should('have.attr', 'role', 'button')
    })
  })

  describe('Error Handling Accessibility', () => {
    it('should announce errors to screen readers', () => {
      cy.visit('/login')
      
      // Trigger validation errors
      cy.get('[data-testid="login-button"]').click()
      
      // Test error announcements
      cy.get('[role="alert"]').should('exist')
      cy.get('[aria-live="assertive"]').should('exist')
      
      // Test error association with inputs
      cy.get('[data-testid="email-input"]')
        .should('have.attr', 'aria-describedby')
        .should('have.attr', 'aria-invalid', 'true')
    })

    it('should handle processing errors accessibly', () => {
      cy.intercept('POST', '/api/upload', {
        statusCode: 500,
        body: { success: false, error: 'Upload failed' }
      }).as('uploadFailed')
      
      cy.login()
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      
      cy.wait('@uploadFailed')
      
      // Test error announcement
      cy.get('[role="alert"]').should('contain', 'Upload failed')
      cy.get('[aria-live="assertive"]').should('exist')
    })
  })
})