describe('Mobile Device Testing', () => {
  beforeEach(() => {
    cy.mockApiResponses()
  })

  describe('iPhone X Portrait', () => {
    beforeEach(() => {
      cy.viewport('iphone-x')
    })

    it('should display mobile-optimized login interface', () => {
      cy.visit('/login')
      
      // Test mobile layout
      cy.get('[data-testid="login-form"]').should('be.visible')
      cy.get('[data-testid="mobile-header"]').should('be.visible')
      
      // Test touch-friendly button sizes
      cy.get('[data-testid="login-button"]').then(($btn) => {
        const rect = $btn[0].getBoundingClientRect()
        expect(rect.height).to.be.at.least(44) // iOS minimum touch target
        expect(rect.width).to.be.at.least(44)
      })
      
      // Test mobile keyboard interaction
      cy.get('[data-testid="email-input"]').type('test@example.com')
      cy.get('[data-testid="password-input"]').type('testpassword123')
      cy.get('[data-testid="login-button"]').click()
      
      cy.wait('@login')
      cy.url().should('include', '/dashboard')
    })

    it('should handle mobile upload workflow', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Test mobile upload interface
      cy.get('[data-testid="mobile-upload-section"]').should('be.visible')
      cy.get('[data-testid="camera-capture-button"]').should('be.visible')
      
      // Test camera interface
      cy.get('[data-testid="camera-capture-button"]').click()
      cy.get('[data-testid="camera-interface"]').should('be.visible')
      cy.get('[data-testid="capture-button"]').should('be.visible')
      
      // Test touch gestures
      cy.get('[data-testid="camera-interface"]').swipe('left')
      cy.get('[data-testid="camera-controls"]').should('be.visible')
    })

    it('should support mobile gestures', () => {
      cy.login()
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      // Test pinch to zoom on images
      cy.get('[data-testid="image-viewer"]').trigger('touchstart', {
        touches: [{ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 200 }]
      })
      
      cy.get('[data-testid="image-viewer"]').trigger('touchmove', {
        touches: [{ clientX: 50, clientY: 50 }, { clientX: 250, clientY: 250 }]
      })
      
      cy.get('[data-testid="image-viewer"]').trigger('touchend')
      
      // Test swipe navigation
      cy.get('[data-testid="results-section"]').swipe('left')
      cy.get('[data-testid="next-section"]').should('be.visible')
    })

    it('should handle mobile keyboard and input', () => {
      cy.login()
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      // Test mobile text editing
      cy.get('[data-testid="text-block"]').first().click()
      cy.get('[data-testid="mobile-text-editor"]').should('be.visible')
      
      // Test virtual keyboard handling
      cy.get('[data-testid="edit-text-input"]').focus()
      cy.get('body').should('have.class', 'keyboard-open')
      
      cy.get('[data-testid="edit-text-input"]').type('Mobile edited text')
      cy.get('[data-testid="save-text-button"]').click()
      
      cy.get('[data-testid="text-block"]').first().should('contain', 'Mobile edited text')
    })
  })

  describe('iPhone X Landscape', () => {
    beforeEach(() => {
      cy.viewport(812, 375) // iPhone X landscape
    })

    it('should adapt to landscape orientation', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Test landscape layout
      cy.get('[data-testid="landscape-layout"]').should('be.visible')
      cy.get('[data-testid="sidebar"]').should('be.visible')
      
      // Test camera in landscape
      cy.get('[data-testid="camera-capture-button"]').click()
      cy.get('[data-testid="landscape-camera"]').should('be.visible')
    })

    it('should handle orientation changes', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Start in landscape
      cy.get('[data-testid="landscape-layout"]').should('be.visible')
      
      // Switch to portrait
      cy.viewport('iphone-x')
      cy.get('[data-testid="portrait-layout"]').should('be.visible')
      
      // Switch back to landscape
      cy.viewport(812, 375)
      cy.get('[data-testid="landscape-layout"]').should('be.visible')
    })
  })

  describe('iPad Portrait', () => {
    beforeEach(() => {
      cy.viewport('ipad-2')
    })

    it('should display tablet-optimized interface', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Test tablet layout
      cy.get('[data-testid="tablet-layout"]').should('be.visible')
      cy.get('[data-testid="sidebar"]').should('be.visible')
      cy.get('[data-testid="main-content"]').should('be.visible')
      
      // Test larger touch targets
      cy.get('button').each(($btn) => {
        const rect = $btn[0].getBoundingClientRect()
        expect(rect.height).to.be.at.least(44)
        expect(rect.width).to.be.at.least(44)
      })
    })

    it('should handle tablet-specific interactions', () => {
      cy.login()
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      // Test split-screen view
      cy.get('[data-testid="split-view-button"]').click()
      cy.get('[data-testid="left-panel"]').should('be.visible')
      cy.get('[data-testid="right-panel"]').should('be.visible')
      
      // Test drag and drop between panels
      cy.get('[data-testid="note-item"]').first()
        .drag('[data-testid="right-panel"]')
      
      cy.get('[data-testid="right-panel"]').should('contain', 'note-item')
    })
  })

  describe('Samsung Galaxy S10', () => {
    beforeEach(() => {
      cy.viewport(360, 760) // Galaxy S10 dimensions
    })

    it('should work on Android devices', () => {
      cy.visit('/login')
      
      // Test Android-specific features
      cy.get('[data-testid="login-form"]').should('be.visible')
      
      // Test Android keyboard behavior
      cy.get('[data-testid="email-input"]').focus()
      cy.get('[data-testid="email-input"]').type('test@example.com')
      
      // Test Android back button simulation
      cy.go('back')
      cy.url().should('include', '/login')
    })

    it('should handle Android file picker', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Test file picker on Android
      cy.get('[data-testid="file-upload-button"]').click()
      
      // Should show Android-style file picker
      cy.get('[data-testid="android-file-picker"]').should('be.visible')
    })

    it('should support Android gestures', () => {
      cy.login()
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      // Test Android-specific swipe gestures
      cy.get('[data-testid="results-section"]').swipe('right')
      cy.get('[data-testid="previous-section"]').should('be.visible')
      
      // Test long press
      cy.get('[data-testid="note-item"]').first().trigger('touchstart')
      cy.wait(1000)
      cy.get('[data-testid="note-item"]').first().trigger('touchend')
      
      cy.get('[data-testid="context-menu"]').should('be.visible')
    })
  })

  describe('Small Screen Devices', () => {
    beforeEach(() => {
      cy.viewport(320, 568) // iPhone SE dimensions
    })

    it('should work on very small screens', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Test compact layout
      cy.get('[data-testid="compact-layout"]').should('be.visible')
      
      // Test collapsible sections
      cy.get('[data-testid="collapsible-header"]').click()
      cy.get('[data-testid="collapsible-content"]').should('not.be.visible')
      
      cy.get('[data-testid="collapsible-header"]').click()
      cy.get('[data-testid="collapsible-content"]').should('be.visible')
    })

    it('should handle limited screen real estate', () => {
      cy.login()
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      // Test tabbed interface for small screens
      cy.get('[data-testid="tab-clusters"]').click()
      cy.get('[data-testid="clusters-content"]').should('be.visible')
      cy.get('[data-testid="summary-content"]').should('not.be.visible')
      
      cy.get('[data-testid="tab-summary"]').click()
      cy.get('[data-testid="summary-content"]').should('be.visible')
      cy.get('[data-testid="clusters-content"]').should('not.be.visible')
    })
  })

  describe('Touch and Gesture Support', () => {
    beforeEach(() => {
      cy.viewport('iphone-x')
    })

    it('should support basic touch interactions', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Test tap
      cy.get('[data-testid="upload-button"]').trigger('touchstart')
      cy.get('[data-testid="upload-button"]').trigger('touchend')
      
      // Test double tap
      cy.get('[data-testid="zoom-target"]').trigger('touchstart')
      cy.get('[data-testid="zoom-target"]').trigger('touchend')
      cy.get('[data-testid="zoom-target"]').trigger('touchstart')
      cy.get('[data-testid="zoom-target"]').trigger('touchend')
      
      cy.get('[data-testid="zoomed-view"]').should('be.visible')
    })

    it('should support swipe gestures', () => {
      cy.login()
      cy.visit('/projects')
      cy.wait('@getProjects')
      
      // Test swipe to delete
      cy.get('[data-testid="project-card"]').first().swipe('left')
      cy.get('[data-testid="delete-action"]').should('be.visible')
      
      // Test swipe to cancel
      cy.get('[data-testid="project-card"]').first().swipe('right')
      cy.get('[data-testid="delete-action"]').should('not.be.visible')
    })

    it('should support pinch to zoom', () => {
      cy.login()
      cy.visit('/dashboard')
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      cy.waitForProcessingComplete()
      
      // Test pinch to zoom
      cy.get('[data-testid="image-viewer"]').trigger('touchstart', {
        touches: [
          { clientX: 150, clientY: 150 },
          { clientX: 250, clientY: 250 }
        ]
      })
      
      cy.get('[data-testid="image-viewer"]').trigger('touchmove', {
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 300, clientY: 300 }
        ]
      })
      
      cy.get('[data-testid="image-viewer"]').trigger('touchend')
      
      cy.get('[data-testid="zoomed-image"]').should('be.visible')
    })
  })

  describe('Mobile Performance', () => {
    beforeEach(() => {
      cy.viewport('iphone-x')
    })

    it('should maintain performance on mobile devices', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Test page load performance
      cy.window().then((win) => {
        const loadTime = win.performance.timing.loadEventEnd - win.performance.timing.navigationStart
        expect(loadTime).to.be.lessThan(5000) // 5 seconds max on mobile
      })
      
      // Test scroll performance
      const start = Date.now()
      cy.scrollTo('bottom')
      const end = Date.now()
      
      expect(end - start).to.be.lessThan(1000) // Smooth scrolling
    })

    it('should handle memory constraints', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Upload multiple images to test memory usage
      for (let i = 0; i < 3; i++) {
        cy.uploadTestImage(`test-${i}.jpg`)
      }
      
      cy.get('[data-testid="start-upload-button"]').click()
      
      // Should handle multiple uploads without crashing
      cy.get('[data-testid="processing-status"]').should('be.visible')
      cy.get('[data-testid="memory-warning"]').should('not.exist')
    })
  })

  describe('Mobile Accessibility', () => {
    beforeEach(() => {
      cy.viewport('iphone-x')
    })

    it('should support mobile screen readers', () => {
      cy.visit('/login')
      cy.injectAxe()
      
      // Test mobile accessibility
      cy.checkA11y(null, {
        rules: {
          'touch-target-size': { enabled: true },
          'mobile-focus-indicators': { enabled: true }
        }
      })
      
      // Test VoiceOver/TalkBack support
      cy.get('[data-testid="login-button"]')
        .should('have.attr', 'aria-label')
        .should('have.attr', 'role', 'button')
    })

    it('should support mobile keyboard navigation', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Test external keyboard support
      cy.get('body').tab()
      cy.focused().should('be.visible')
      
      // Test on-screen keyboard
      cy.get('[data-testid="search-input"]').focus()
      cy.get('body').should('have.class', 'keyboard-visible')
    })
  })

  describe('PWA Features on Mobile', () => {
    beforeEach(() => {
      cy.viewport('iphone-x')
    })

    it('should support PWA installation', () => {
      cy.visit('/dashboard')
      cy.login()
      
      // Test PWA manifest
      cy.get('link[rel="manifest"]').should('exist')
      
      // Test service worker registration
      cy.window().then((win) => {
        expect(win.navigator.serviceWorker).to.exist
      })
      
      // Test install prompt
      cy.get('[data-testid="install-app-button"]').should('be.visible')
    })

    it('should work offline', () => {
      cy.login()
      cy.visit('/dashboard')
      
      // Simulate offline mode
      cy.window().then((win) => {
        cy.stub(win.navigator, 'onLine').value(false)
        win.dispatchEvent(new Event('offline'))
      })
      
      // Should show offline indicator
      cy.get('[data-testid="offline-indicator"]').should('be.visible')
      
      // Should still allow viewing cached content
      cy.visit('/projects')
      cy.get('[data-testid="cached-projects"]').should('be.visible')
    })
  })
})