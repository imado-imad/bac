(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== "undefined") {
    factory(exports);
  } else {
    var mod = {
      exports: {}
    };
    factory(mod.exports);
    global.PinchZoom = mod.exports;
  }
})(this, function (exports) {
  'use strict';

  Object.defineProperty(exports, "__esModule", {
    value: true
  });

  // Polyfill for Object.assign
  if (typeof Object.assign != 'function') {
    Object.defineProperty(Object, "assign", {
      value: function assign(target, varArgs) {
        if (target == null) {
          throw new TypeError('Cannot convert undefined or null to object');
        }
        var to = Object(target);
        for (var index = 1; index < arguments.length; index++) {
          var nextSource = arguments[index];
          if (nextSource != null) {
            for (var nextKey in nextSource) {
              if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                to[nextKey] = nextSource[nextKey];
              }
            }
          }
        }
        return to;
      },
      writable: true,
      configurable: true
    });
  }

  // Polyfill for Array.from
  if (typeof Array.from != 'function') {
    Array.from = function (object) {
      return [].slice.call(object);
    };
  }

  // Helper function to create DOM elements from string
  var buildElement = function buildElement(str) {
    var tmp = document.implementation.createHTMLDocument('');
    tmp.body.innerHTML = str;
    return Array.from(tmp.body.children)[0];
  };

  // Helper functions
  var sum = function sum(a, b) {
    return a + b;
  };

  var isCloseTo = function isCloseTo(value, expected) {
    return value > expected - 0.01 && value < expected + 0.01;
  };

  // Main PinchZoom definition
  var definePinchZoom = function definePinchZoom() {
    var PinchZoom = function PinchZoom(el, options) {
      this.el = el;
      this.zoomFactor = 1;
      this.lastScale = 1;
      this.offset = { x: 0, y: 0 };
      this.initialOffset = { x: 0, y: 0 };
      this.options = Object.assign({}, this.defaults, options);
      this.setupMarkup();
      this.bindEvents();
      this.update();

      if (this.isImageLoaded(this.el)) {
        this.updateAspectRatio();
        this.setupOffsets();
      }

      this.enabled = true;
      this.startDistance = null;
      this.lastTouchTime = 0;
      this.touchCount = 0;
    };

    PinchZoom.prototype = {
      defaults: {
        tapZoomFactor: 2,
        zoomOutFactor: 1.3,
        animationDuration: 300,
        maxZoom: 4,
        minZoom: 0.5,
        draggableUnzoomed: true,
        lockDragAxis: false,
        setOffsetsOnce: false,
        use2d: true,
        verticalPadding: 0,
        horizontalPadding: 0
      },

      // Set up the DOM structure
      setupMarkup: function setupMarkup() {
        this.container = buildElement('<div class="pinch-zoom-container"></div>');
        this.el.parentNode.insertBefore(this.container, this.el);
        this.container.appendChild(this.el);

        // Container styles
        this.container.style.position = 'relative';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.overflow = 'hidden';
        this.container.style.touchAction = 'none';

        // Element styles
        this.el.style.transformOrigin = '0% 0%';
        this.el.style.position = 'absolute';
        this.el.style.top = '0';
        this.el.style.left = '0';
        this.el.style.width = '100%';
        this.el.style.height = '100%';
        this.el.style.boxSizing = 'border-box';
        this.el.style.willChange = 'transform';
      },

      // Update the aspect ratio of the container
      updateAspectRatio: function updateAspectRatio() {
        this.unsetContainerY();
        this.setContainerY(this.container.parentElement.offsetHeight);
      },

      // Handle zoom start event
      handleZoomStart: function handleZoomStart(event) {
        this.stopAnimation();
        this.lastScale = 1;
        this.hasInteraction = true;
        
        // Store initial touch positions
        if (event.touches && event.touches.length === 2) {
          var touch1 = event.touches[0];
          var touch2 = event.touches[1];
          this.startDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
          );
          this.startZoomFactor = this.zoomFactor;
          
          // Calculate initial center point
          var rect = this.container.getBoundingClientRect();
          this.initialCenter = {
            x: (touch1.clientX + touch2.clientX) / 2 - rect.left,
            y: (touch1.clientY + touch2.clientY) / 2 - rect.top
          };
        }
      },

      // Handle zoom event
      handleZoom: function handleZoom(event) {
        if (!event.touches || event.touches.length !== 2) return;
        
        var touch1 = event.touches[0];
        var touch2 = event.touches[1];
        
        // Calculate current distance between fingers
        var currentDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        
        // Calculate scale based on distance change
        if (this.startDistance) {
          var scale = currentDistance / this.startDistance;
          var newScale = this.startZoomFactor * scale;
          
          // Constrain to min/max zoom
          newScale = Math.max(this.options.minZoom, Math.min(newScale, this.options.maxZoom));
          
          // Calculate current center point
          var rect = this.container.getBoundingClientRect();
          var currentCenter = {
            x: (touch1.clientX + touch2.clientX) / 2 - rect.left,
            y: (touch1.clientY + touch2.clientY) / 2 - rect.top
          };
          
          // Apply the zoom centered between fingers
          this.scaleTo(newScale, currentCenter);
          
          // Adjust position based on center movement
          var centerDiff = {
            x: currentCenter.x - this.initialCenter.x,
            y: currentCenter.y - this.initialCenter.y
          };
          
          this.addOffset({
            x: centerDiff.x * (newScale / this.startZoomFactor),
            y: centerDiff.y * (newScale / this.startZoomFactor)
          });
        }
      },

      // Handle zoom end event
      handleZoomEnd: function handleZoomEnd() {
        this.startDistance = null;
        this.initialCenter = null;
        this.end();
      },

      // Handle double tap
      handleDoubleTap: function handleDoubleTap(event) {
        var now = Date.now();
        if (now - this.lastTouchTime < 300 && this.touchCount === 1) {
          // Double tap detected
          var rect = this.container.getBoundingClientRect();
          var center = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
          };
          
          var zoomFactor = this.zoomFactor > 1 ? 1 : this.options.tapZoomFactor;
          this.scaleTo(zoomFactor, center);
          
          event.preventDefault();
          event.stopPropagation();
        }
        this.lastTouchTime = now;
        this.touchCount = event.touches ? event.touches.length : 1;
      },

      // Scale to a specific zoom factor
      scaleTo: function scaleTo(zoomFactor, center) {
        this.scale(zoomFactor / this.zoomFactor, center);
      },

      // Scale by a factor from a center point
      scale: function scale(scale, center) {
        scale = this.scaleZoomFactor(scale);
        this.addOffset({
          x: (scale - 1) * (center.x + this.offset.x),
          y: (scale - 1) * (center.y + this.offset.y)
        });
      },

      // Adjust zoom factor with constraints
      scaleZoomFactor: function scaleZoomFactor(scale) {
        var originalZoomFactor = this.zoomFactor;
        this.zoomFactor *= scale;
        this.zoomFactor = Math.min(this.options.maxZoom, Math.max(this.zoomFactor, this.options.minZoom));
        return this.zoomFactor / originalZoomFactor;
      },

      // Update the element's transform
      update: function update() {
        if (this.updatePlanned) {
          return;
        }
        this.updatePlanned = true;

        window.setTimeout(function() {
          this.updatePlanned = false;
          
          var zoomFactor = this.getInitialZoomFactor() * this.zoomFactor;
          var offsetX = -(this.offset.x / zoomFactor);
          var offsetY = -(this.offset.y / zoomFactor);
          
          var transform = 'scale(' + zoomFactor + ', ' + zoomFactor + ') translate(' + offsetX + 'px, ' + offsetY + 'px)';
          
          this.el.style.transform = transform;
          this.el.style.webkitTransform = transform;
        }.bind(this), 0);
      },

      // Add offset to current position
      addOffset: function addOffset(offset) {
        this.offset.x += offset.x;
        this.offset.y += offset.y;
        this.offset = this.sanitizeOffset(this.offset);
      },

      // Sanitize offset to keep within bounds
      sanitizeOffset: function sanitizeOffset(offset) {
        var elWidth = this.el.offsetWidth * this.getInitialZoomFactor() * this.zoomFactor;
        var elHeight = this.el.offsetHeight * this.getInitialZoomFactor() * this.zoomFactor;
        var maxX = elWidth - this.getContainerX() + this.options.horizontalPadding;
        var maxY = elHeight - this.getContainerY() + this.options.verticalPadding;
        var maxOffsetX = Math.max(maxX, 0);
        var maxOffsetY = Math.max(maxY, 0);
        var minOffsetX = Math.min(maxX, 0) - this.options.horizontalPadding;
        var minOffsetY = Math.min(maxY, 0) - this.options.verticalPadding;

        return {
          x: Math.min(Math.max(offset.x, minOffsetX), maxOffsetX),
          y: Math.min(Math.max(offset.y, minOffsetY), maxOffsetY)
        };
      },

      // Bind event listeners
      bindEvents: function bindEvents() {
        var self = this;
        
        // Touch events
        this.container.addEventListener('touchstart', function(e) {
          if (self.enabled) {
            self.handleDoubleTap(e);
            if (e.touches.length === 2) {
              self.handleZoomStart(e);
            }
          }
        }, { passive: false });

        this.container.addEventListener('touchmove', function(e) {
          if (self.enabled) {
            if (e.touches.length === 2) {
              self.handleZoom(e);
              e.preventDefault();
            }
          }
        }, { passive: false });

        this.container.addEventListener('touchend', function(e) {
          if (self.enabled) {
            if (e.touches.length < 2) {
              self.handleZoomEnd();
            }
          }
        });

        // Mouse events for double click
        this.container.addEventListener('dblclick', function(e) {
          if (self.enabled) {
            var rect = self.container.getBoundingClientRect();
            var center = {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top
            };
            var zoomFactor = self.zoomFactor > 1 ? 1 : self.options.tapZoomFactor;
            self.scaleTo(zoomFactor, center);
          }
        });

        // Window resize
        this.resizeHandler = this.update.bind(this);
        window.addEventListener('resize', this.resizeHandler);
        
        // Image load events
        if (this.el.nodeName === 'IMG') {
          this.el.addEventListener('load', this.update.bind(this));
        }
        Array.from(this.el.querySelectorAll('img')).forEach(function(imgEl) {
          imgEl.addEventListener('load', self.update.bind(self));
        });
      },

      // Get initial zoom factor (fit to container)
      getInitialZoomFactor: function getInitialZoomFactor() {
        var xZoomFactor = this.container.offsetWidth / this.el.offsetWidth;
        var yZoomFactor = this.container.offsetHeight / this.el.offsetHeight;
        return Math.min(xZoomFactor, yZoomFactor);
      },

      // Get container dimensions
      getContainerX: function getContainerX() {
        return this.container.offsetWidth;
      },

      getContainerY: function getContainerY() {
        return this.container.offsetHeight;
      },

      setContainerY: function setContainerY(y) {
        this.container.style.height = y + 'px';
      },

      unsetContainerY: function unsetContainerY() {
        this.container.style.height = null;
      },

      // Check if image is loaded
      isImageLoaded: function isImageLoaded(el) {
        if (el.nodeName === 'IMG') {
          return el.complete && el.naturalHeight !== 0;
        } else {
          return Array.from(el.querySelectorAll('img')).every(this.isImageLoaded);
        }
      },

      // Setup initial offsets
      setupOffsets: function setupOffsets() {
        if (this.options.setOffsetsOnce && this._isOffsetsSet) {
          return;
        }
        this._isOffsetsSet = true;
        this.computeInitialOffset();
        this.resetOffset();
      },

      computeInitialOffset: function computeInitialOffset() {
        this.initialOffset = {
          x: -Math.abs(this.el.offsetWidth * this.getInitialZoomFactor() - this.container.offsetWidth) / 2,
          y: -Math.abs(this.el.offsetHeight * this.getInitialZoomFactor() - this.container.offsetHeight) / 2
        };
      },

      resetOffset: function resetOffset() {
        this.offset.x = this.initialOffset.x;
        this.offset.y = this.initialOffset.y;
      },

      // Animation methods
      animate: function animate(duration, framefn, timefn, callback) {
        var startTime = new Date().getTime();
        var renderFrame = function() {
          if (!this.inAnimation) {
            return;
          }
          var frameTime = new Date().getTime() - startTime;
          var progress = frameTime / duration;
          if (frameTime >= duration) {
            framefn(1);
            if (callback) {
              callback();
            }
            this.update();
            this.stopAnimation();
            this.update();
          } else {
            if (timefn) {
              progress = timefn(progress);
            }
            framefn(progress);
            this.update();
            requestAnimationFrame(renderFrame);
          }
        }.bind(this);
        this.inAnimation = true;
        requestAnimationFrame(renderFrame);
      },

      stopAnimation: function stopAnimation() {
        this.inAnimation = false;
      },

      swing: function swing(p) {
        return -Math.cos(p * Math.PI) / 2 + 0.5;
      },

      // End interaction
      end: function end() {
        this.hasInteraction = false;
        this.sanitize();
        this.update();
      },

      // Check if offset is valid
      isInsaneOffset: function isInsaneOffset(offset) {
        var sanitizedOffset = this.sanitizeOffset(offset);
        return sanitizedOffset.x !== offset.x || sanitizedOffset.y !== offset.y;
      },

      // Sanitize current position
      sanitize: function sanitize() {
        if (this.zoomFactor < this.options.zoomOutFactor) {
          this.zoomOutAnimation();
        } else if (this.isInsaneOffset(this.offset)) {
          this.sanitizeOffsetAnimation();
        }
      },

      // Zoom out animation
      zoomOutAnimation: function zoomOutAnimation() {
        if (this.zoomFactor === 1) {
          return;
        }
        var startZoomFactor = this.zoomFactor;
        var zoomFactor = 1;
        var center = this.getCurrentZoomCenter();
        var updateProgress = function(progress) {
          this.scaleTo(startZoomFactor + progress * (zoomFactor - startZoomFactor), center;
        }.bind(this);
        this.animate(this.options.animationDuration, updateProgress, this.swing);
      },

      // Sanitize offset animation
      sanitizeOffsetAnimation: function sanitizeOffsetAnimation() {
        var targetOffset = this.sanitizeOffset(this.offset);
        var startOffset = { x: this.offset.x, y: this.offset.y };
        var updateProgress = function(progress) {
          this.offset.x = startOffset.x + progress * (targetOffset.x - startOffset.x);
          this.offset.y = startOffset.y + progress * (targetOffset.y - startOffset.y);
          this.update();
        }.bind(this);
        this.animate(this.options.animationDuration, updateProgress, this.swing);
      },

      // Get current zoom center
      getCurrentZoomCenter: function getCurrentZoomCenter() {
        var offsetLeft = this.offset.x - this.initialOffset.x;
        var centerX = -1 * this.offset.x - offsetLeft / (1 / this.zoomFactor - 1);
        var offsetTop = this.offset.y - this.initialOffset.y;
        var centerY = -1 * this.offset.y - offsetTop / (1 / this.zoomFactor - 1);
        return { x: centerX, y: centerY };
      },

      // Check if dragging is allowed
      canDrag: function canDrag() {
        return this.options.draggableUnzoomed || !isCloseTo(this.zoomFactor, 1);
      }
    };

    return PinchZoom;
  };

  var PinchZoom = definePinchZoom();
  exports.default = PinchZoom;
});
