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
    /*
        ImadZoom.js
        Copyright (c) Manuel Stofer 2025 - today
    
        Author: Manuel Stofer (@gmail.com)
        Version: 1.1.5
    */

    // polyfills
    if (typeof Object.assign != 'function') {
        // Must be writable: true, enumerable: false, configurable: true
        Object.defineProperty(Object, "assign", {
            value: function assign(target, varArgs) {
                // .length of function is 2
                if (target == null) {
                    // TypeError if undefined or null
                    throw new TypeError('Cannot convert undefined or null to object');
                }

                var to = Object(target);

                for (var index = 1; index < arguments.length; index++) {
                    var nextSource = arguments[index];

                    if (nextSource != null) {
                        // Skip over if undefined or null
                        for (var nextKey in nextSource) {
                            // Avoid bugs when hasOwnProperty is shadowed
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

    if (typeof Array.from != 'function') {
        Array.from = function (object) {
            return [].slice.call(object);
        };
    }

    // utils
    var buildElement = function buildElement(str) {
        // empty string as title argument required by IE and Edge
        var tmp = document.implementation.createHTMLDocument('');
        tmp.body.innerHTML = str;
        return Array.from(tmp.body.children)[0];
    };

    var definePinchZoom = function definePinchZoom() {

        /**
         * Pinch zoom
         * @param el
         * @param options
         * @constructor
         */
        var PinchZoom = function PinchZoom(el, options) {
            this.el = el;
            this.zoomFactor = 1;
            this.lastScale = 1;
            this.offset = {
                x: 0,
                y: 0
            };
            this.initialOffset = {
                x: 0,
                y: 0
            };
            // MODIFICATION: Initialize scrollContainer property
            this.scrollContainer = null;
            this.options = Object.assign({}, this.defaults, options);
            this.setupMarkup();
            this.bindEvents();
            this.update();

            // The image may already be loaded when PinchZoom is initialized,
            // and then the load event (which trigger update) will never fire.
            if (this.isImageLoaded(this.el)) {
                this.updateAspectRatio();
                this.setupOffsets();
            }

            this.enabled = true;
        },
            sum = function sum(a, b) {
            return a + b;
        },
            isCloseTo = function isCloseTo(value, expected) {
            return value > expected - 0.01 && value < expected + 0.01;
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

            /**
             * Event handler for 'dragstart'
             * @param event
             */
            handleDragStart: function handleDragStart(event) {
                this.stopAnimation();
                this.lastDragPosition = false;
                this.hasInteraction = true;
                this.handleDrag(event);
            },

            /**
             * Event handler for 'drag'
             * @param event
             */
            handleDrag: function handleDrag(event) {
                var touch = this.getTouches(event)[0];
                this.drag(touch, this.lastDragPosition);
                this.offset = this.sanitizeOffset(this.offset);
                this.lastDragPosition = touch;
            },

            handleDragEnd: function handleDragEnd() {
                this.end();
            },

            /**
             * Event handler for 'zoomstart'
             * @param event
             */
            handleZoomStart: function handleZoomStart(event) {
                this.stopAnimation();
                this.lastScale = 1;
                this.nthZoom = 0;
                this.lastZoomCenter = false;
                this.hasInteraction = true;
            },

            /**
             * Event handler for 'zoom'
             * @param event
             */
            handleZoom: function handleZoom(event, newScale) {
                // a relative scale factor is used
                var touchCenter = this.getTouchCenter(this.getTouches(event)),
                    scale = newScale / this.lastScale;
                this.lastScale = newScale;

                // the first touch events are thrown away since they are not precise
                this.nthZoom += 1;
                if (this.nthZoom > 3) {

                    this.scale(scale, touchCenter);
                    this.drag(touchCenter, this.lastZoomCenter);
                }
                this.lastZoomCenter = touchCenter;
            },

            handleZoomEnd: function handleZoomEnd() {
                this.end();
            },

            /**
             * Event handler for 'doubletap'
             * @param event
             */
            handleDoubleTap: function handleDoubleTap(event) {
                var center = this.getTouches(event)[0],
                    zoomFactor = this.zoomFactor > 1 ? 1 : this.options.tapZoomFactor,
                    startZoomFactor = this.zoomFactor,
                    updateProgress = function (progress) {
                    this.scaleTo(startZoomFactor + progress * (zoomFactor - startZoomFactor), center);
                }.bind(this);

                if (this.hasInteraction) {
                    return;
                }

                this.isDoubleTap = true;

                if (startZoomFactor > zoomFactor) {
                    center = this.getCurrentZoomCenter();
                }

                this.animate(this.options.animationDuration, updateProgress, this.swing);
            },

            /**
             * Compute the initial offset
             *
             * the element should be centered in the container upon initialization
             */
            computeInitialOffset: function computeInitialOffset() {
                this.initialOffset = {
                    x: -Math.abs(this.el.offsetWidth * this.getInitialZoomFactor() - this.container.offsetWidth) / 2,
                    y: -Math.abs(this.el.offsetHeight * this.getInitialZoomFactor() - this.container.offsetHeight) / 2
                };
            },

            /**
             * Reset current image offset to that of the initial offset
             */
            resetOffset: function resetOffset() {
                this.offset.x = this.initialOffset.x;
                this.offset.y = this.initialOffset.y;
            },

            /**
             * Determine if image is loaded
             */
            isImageLoaded: function isImageLoaded(el) {
                if (el.nodeName === 'IMG') {
                    return el.complete && el.naturalHeight !== 0;
                } else {
                    return Array.from(el.querySelectorAll('img')).every(this.isImageLoaded);
                }
            },

            setupOffsets: function setupOffsets() {
                if (this.options.setOffsetsOnce && this._isOffsetsSet) {
                    return;
                }

                this._isOffsetsSet = true;

                this.computeInitialOffset();
                this.resetOffset();
            },

            /**
             * Max / min values for the offset
             * @param offset
             * @return {Object} the sanitized offset
             */
            sanitizeOffset: function sanitizeOffset(offset) {
                var elWidth = this.el.offsetWidth * this.getInitialZoomFactor() * this.zoomFactor;
                var elHeight = this.el.offsetHeight * this.getInitialZoomFactor() * this.zoomFactor;
                var maxX = elWidth - this.getContainerX() + this.options.horizontalPadding,
                    maxY = elHeight - this.getContainerY() + this.options.verticalPadding,
                    maxOffsetX = Math.max(maxX, 0),
                    maxOffsetY = Math.max(maxY, 0),
                    minOffsetX = Math.min(maxX, 0) - this.options.horizontalPadding,
                    minOffsetY = Math.min(maxY, 0) - this.options.verticalPadding;

                return {
                    x: Math.min(Math.max(offset.x, minOffsetX), maxOffsetX),
                    y: Math.min(Math.max(offset.y, minOffsetY), maxOffsetY)
                };
            },

            /**
             * Scale to a specific zoom factor (not relative)
             * @param zoomFactor
             * @param center
             */
            scaleTo: function scaleTo(zoomFactor, center) {
                this.scale(zoomFactor / this.zoomFactor, center);
            },

            /**
             * Scales the element from specified center
             * @param scale
             * @param center
             */
            scale: function scale(_scale, center) {
                _scale = this.scaleZoomFactor(_scale);
                this.addOffset({
                    x: (_scale - 1) * (center.x + this.offset.x),
                    y: (_scale - 1) * (center.y + this.offset.y)
                });
            },

            /**
             * Scales the zoom factor relative to current state
             * @param scale
             * @return the actual scale (can differ because of max min zoom factor)
             */
            scaleZoomFactor: function scaleZoomFactor(scale) {
                var originalZoomFactor = this.zoomFactor;
                this.zoomFactor *= scale;
                this.zoomFactor = Math.min(this.options.maxZoom, Math.max(this.zoomFactor, this.options.minZoom));
                return this.zoomFactor / originalZoomFactor;
            },

            /**
             * Determine if the image is in a draggable state
             *
             * When the image can be dragged, the drag event is acted upon and cancelled.
             * When not draggable, the drag event bubbles through this component.
             *
             * @return {Boolean}
             */
            
            canDrag: function canDrag() {
                return this.options.draggableUnzoomed || !isCloseTo(this.zoomFactor, 1);
            },

            /**
             * Drags the element
             * @param center
             * @param lastCenter
             */
            drag: function drag(center, lastCenter) {
                if (lastCenter) {
                    if (this.options.lockDragAxis) {
                        // lock scroll to position that was changed the most
                        if (Math.abs(center.x - lastCenter.x) > Math.abs(center.y - lastCenter.y)) {
                            this.addOffset({
                                x: -(center.x - lastCenter.x),
                                y: 0
                            });
                        } else {
                            this.addOffset({
                                y: -(center.y - lastCenter.y),
                                x: 0
                            });
                        }
                    } else {
                        this.addOffset({
                            y: -(center.y - lastCenter.y),
                            x: -(center.x - lastCenter.x)
                        });
                    }
                }
            },

            /**
             * Calculates the touch center of multiple touches
             * @param touches
             * @return {Object}
             */
            getTouchCenter: function getTouchCenter(touches) {
                return this.getVectorAvg(touches);
            },

            /**
             * Calculates the average of multiple vectors (x, y values)
             */
            getVectorAvg: function getVectorAvg(vectors) {
                return {
                    x: vectors.map(function (v) {
                        return v.x;
                    }).reduce(sum) / vectors.length,
                    y: vectors.map(function (v) {
                        return v.y;
                    }).reduce(sum) / vectors.length
                };
            },

            /**
             * Adds an offset
             * @param offset the offset to add
             * @return return true when the offset change was accepted
             */
            addOffset: function addOffset(offset) {
                this.offset = {
                    x: this.offset.x + offset.x,
                    y: this.offset.y + offset.y
                };
            },

            sanitize: function sanitize() {
                if (this.zoomFactor < this.options.zoomOutFactor) {
                    this.zoomOutAnimation();
                } else if (this.isInsaneOffset(this.offset)) {
                    this.sanitizeOffsetAnimation();
                }
            },

            /**
             * Checks if the offset is ok with the current zoom factor
             * @param offset
             * @return {Boolean}
             */
            isInsaneOffset: function isInsaneOffset(offset) {
                var sanitizedOffset = this.sanitizeOffset(offset);
                return sanitizedOffset.x !== offset.x || sanitizedOffset.y !== offset.y;
            },

            /**
             * Creates an animation moving to a sane offset
             */
            sanitizeOffsetAnimation: function sanitizeOffsetAnimation() {
                var targetOffset = this.sanitizeOffset(this.offset),
                    startOffset = {
                    x: this.offset.x,
                    y: this.offset.y
                },
                    updateProgress = function (progress) {
                    this.offset.x = startOffset.x + progress * (targetOffset.x - startOffset.x);
                    this.offset.y = startOffset.y + progress * (targetOffset.y - startOffset.y);
                    this.update();
                }.bind(this);

                this.animate(this.options.animationDuration, updateProgress, this.swing);
            },

            /**
             * Zooms back to the original position,
             * (no offset and zoom factor 1)
             */
            zoomOutAnimation: function zoomOutAnimation() {
                if (this.zoomFactor === 1) {
                    return;
                }

                var startZoomFactor = this.zoomFactor,
                    zoomFactor = 1,
                    center = this.getCurrentZoomCenter(),
                    updateProgress = function (progress) {
                    this.scaleTo(startZoomFactor + progress * (zoomFactor - startZoomFactor), center);
                }.bind(this);

                this.animate(this.options.animationDuration, updateProgress, this.swing);
            },

            /**
             * Updates the container aspect ratio
             */
            updateAspectRatio: function updateAspectRatio() {
                // Set container height to match the element height
                this.setContainerY(this.el.offsetHeight);
            },

            /**
             * Calculates the initial zoom factor (for the element to fit into the container)
             * @return {number} the initial zoom factor
             */
            getInitialZoomFactor: function getInitialZoomFactor() {
                var xZoomFactor = this.container.offsetWidth / this.el.offsetWidth;
                var yZoomFactor = this.container.offsetHeight / this.el.offsetHeight;

                return Math.min(xZoomFactor, yZoomFactor);
            },

            /**
             * Calculates the virtual zoom center for the current offset and zoom factor
             * (used for reverse zoom)
             * @return {Object} the current zoom center
             */
            getCurrentZoomCenter: function getCurrentZoomCenter() {
                var offsetLeft = this.offset.x - this.initialOffset.x;
                var centerX = -1 * this.offset.x - offsetLeft / (1 / this.zoomFactor - 1);

                var offsetTop = this.offset.y - this.initialOffset.y;
                var centerY = -1 * this.offset.y - offsetTop / (1 / this.zoomFactor - 1);

                return {
                    x: centerX,
                    y: centerY
                };
            },

            /**
             * Returns the touches of an event relative to the container offset
             * @param event
             * @return array touches
             */
            getTouches: function getTouches(event) {
                var rect = this.container.getBoundingClientRect();
                var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
                var scrollLeft = document.documentElement.scrollLeft || document.body.scrollLeft;
                var posTop = rect.top + scrollTop;
                var posLeft = rect.left + scrollLeft;

                return Array.prototype.slice.call(event.touches).map(function (touch) {
                    return {
                        x: touch.pageX - posLeft,
                        y: touch.pageY - posTop
                    };
                });
            },

            /**
             * Animation loop
             * does not support simultaneous animations
             * @param duration
             * @param framefn
             * @param timefn
             * @param callback
             */
            animate: function animate(duration, framefn, timefn, callback) {
                var startTime = new Date().getTime(),
                    renderFrame = function () {
                    if (!this.inAnimation) {
                        return;
                    }
                    var frameTime = new Date().getTime() - startTime,
                        progress = frameTime / duration;
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

            /**
             * Stops the animation
             */
            stopAnimation: function stopAnimation() {
                this.inAnimation = false;
            },

            /**
             * Swing timing function for animations
             * @param p
             * @return {Number}
             */
            swing: function swing(p) {
                return -Math.cos(p * Math.PI) / 2 + 0.5;
            },

            getContainerX: function getContainerX() {
                return this.container.offsetWidth;
            },

            getContainerY: function getContainerY() {
                return window.innerHeight;
            },
            setContainerY: function setContainerY(y) {
                return this.container.style.height = y + 'px';
            },
         
            unsetContainerY: function unsetContainerY() {
                this.container.style.height = null;
            },

            /**
             * Creates the expected html structure
             */
            // MODIFICATION: Rewritten to include a scrolling container
            setupMarkup: function setupMarkup() {
                // This is the new container that will provide the vertical scrolling
                this.scrollContainer = buildElement('<div class="pinch-zoom-scroll-container"></div>');
                this.el.parentNode.insertBefore(this.scrollContainer, this.el);

                // This is the original container
                this.container = buildElement('<div class="pinch-zoom-container"></div>');
                this.scrollContainer.appendChild(this.container);

                this.container.appendChild(this.el);

                // Style the new scroll container to take up the full screen height and allow scrolling
                this.scrollContainer.style.height = '100vh';
                this.scrollContainer.style.overflowY = 'auto';
                this.scrollContainer.style.webkitOverflowScrolling = 'touch'; // For smoother scrolling on iOS

                // Adjust the original container to be visible within the scrolling container
                this.container.style.overflow = 'visible';
                this.container.style.position = 'relative';

                // Set initial container height to match the element
                this.container.style.height = this.el.offsetHeight + 'px';

                // Style the element itself
                this.el.style.transformOrigin = '0% 0%';
                this.el.style.position = 'absolute';
                this.el.style.width = '100%';
                this.el.style.height = 'auto';
                this.el.style.top = '0';
                this.el.style.left = '0';
                this.el.style.boxSizing = 'border-box';
                this.el.style.willChange = 'transform';
            },

            end: function end() {
                this.hasInteraction = false;
                this.sanitize();
                this.update();
            },

            /**
             * Binds all required event listeners
             */
            bindEvents: function bindEvents() {
                var self = this;
                detectGestures(this.container, this);

                this.resizeHandler = this.update.bind(this);
                window.addEventListener('resize', this.resizeHandler);
                Array.from(this.el.querySelectorAll('img')).forEach(function (imgEl) {
                    imgEl.addEventListener('load', self.update.bind(self));
                });

                if (this.el.nodeName === 'IMG') {
                    this.el.addEventListener('load', this.update.bind(this));
                }
            },

            /**
             * Updates the css values according to the current zoom factor and offset
             */
            update: function update(event) {
                if (event && event.type === 'resize') {
                    this.updateAspectRatio();
                    this.setupOffsets();
                }

                if (event && event.type === 'load') {
                    this.updateAspectRatio();
                    this.setupOffsets();
                }

                if (this.updatePlanned) {
                    return;
                }
                this.updatePlanned = true;

                window.setTimeout(function () {
                    this.updatePlanned = false;
                    
                    // MODIFICATION: The logic for setting container height and calculating transform is changed
                    var zoomFactor = this.getInitialZoomFactor() * this.zoomFactor;
                    
                    // Update container height to match the scaled element height.
                    // This allows the scroll container to scroll when the content is larger than the viewport.
                    this.setContainerY(this.el.offsetHeight * zoomFactor);

                    var offsetX = -(this.offset.x / zoomFactor),
                        offsetY = -(this.offset.y / zoomFactor),
                        transform3d = 'scale3d(' + zoomFactor + ', ' + zoomFactor + ',1) ' + 'translate3d(' + offsetX + 'px,' + offsetY + 'px,0px)',
                        transform2d = 'scale(' + zoomFactor + ', ' + zoomFactor + ') ' + 'translate(' + offsetX + 'px,' + offsetY + 'px)',
                        removeClone = function () {
                        if (this.clone) {
                            this.clone.parentNode.removeChild(this.clone);
                            delete this.clone;
                        }
                    }.bind(this);

                    // Scale 3d and translate3d are faster (at least on ios)
                    // but they also reduce the quality.
                    // PinchZoom uses the 3d transformations during interactions
                    // after interactions it falls back to 2d transformations
                    if (!this.options.use2d || this.hasInteraction || this.inAnimation) {
                        this.is3d = true;
                        removeClone();

                        this.el.style.webkitTransform = transform3d;
                        this.el.style.mozTransform = transform2d;
                        this.el.style.msTransform = transform2d;
                        this.el.style.oTransform = transform2d;
                        this.el.style.transform = transform3d;
                    } else {
                        // When changing from 3d to 2d transform webkit has some glitches.
                        // To avoid this, a copy of the 3d transformed element is displayed in the
                        // foreground while the element is converted from 3d to 2d transform
                        if (this.is3d) {
                            this.clone = this.el.cloneNode(true);
                            this.clone.style.pointerEvents = 'none';
                            this.container.appendChild(this.clone);
                            window.setTimeout(removeClone, 200);
                        }

                        this.el.style.webkitTransform = transform2d;
                        this.el.style.mozTransform = transform2d;
                        this.el.style.msTransform = transform2d;
                        this.el.style.oTransform = transform2d;
                        this.el.style.transform = transform2d;

                        this.is3d = false;
                    }
                }.bind(this), 0);
            }
        };

        var detectGestures = function detectGestures(el, target) {
            var interaction = null,
                fingers = 0,
                lastTouchStart = null,
                startTouches = null,
                setInteraction = function setInteraction(newInteraction, event) {
                if (interaction !== newInteraction) {

                    if (interaction && !newInteraction) {
                        switch (interaction) {
                            case "zoom":
                                target.handleZoomEnd(event);
                                break;
                            case 'drag':
                                target.handleDragEnd(event);
                                break;
                        }
                    }

                    switch (newInteraction) {
                        case 'zoom':
                            target.handleZoomStart(event);
                            break;
                        case 'drag':
                            target.handleDragStart(event);
                            break;
                    }
                }
                interaction = newInteraction;
            },
                updateInteraction = function updateInteraction(event) {
                if (fingers === 2) {
                    setInteraction('zoom');
                } else if (fingers === 1 && target.canDrag()) {
                    setInteraction('drag', event);
                } else {
                    setInteraction(null, event);
                }
            },
                targetTouches = function targetTouches(touches) {
                return Array.from(touches).map(function (touch) {
                    return {
                        x: touch.pageX,
                        y: touch.pageY
                    };
                });
            },
                getDistance = function getDistance(a, b) {
                var x, y;
                x = a.x - b.x;
                y = a.y - b.y;
                return Math.sqrt(x * x + y * y);
            },
                calculateScale = function calculateScale(startTouches, endTouches) {
                var startDistance = getDistance(startTouches[0], startTouches[1]),
                    endDistance = getDistance(endTouches[0], endTouches[1]);
                return endDistance / startDistance;
            },
                cancelEvent = function cancelEvent(event) {
                event.stopPropagation();
                event.preventDefault();
            },
                detectDoubleTap = function detectDoubleTap(event) {
                var time = new Date().getTime();

                if (fingers > 1) {
                    lastTouchStart = null;
                }

                if (time - lastTouchStart < 300) {
                    cancelEvent(event);

                    target.handleDoubleTap(event);
                    switch (interaction) {
                        case "zoom":
                            target.handleZoomEnd(event);
                            break;
                        case 'drag':
                            target.handleDragEnd(event);
                            break;
                    }
                } else {
                    target.isDoubleTap = false;
                }

                if (fingers === 1) {
                    lastTouchStart = time;
                }
            },
                firstMove = true;

            el.addEventListener('touchstart', function (event) {
                if (target.enabled) {
                    firstMove = true;
                    fingers = event.touches.length;
                    detectDoubleTap(event);
                }
            }, { passive: false });

            el.addEventListener('touchmove', function (event) {
                if (target.enabled && !target.isDoubleTap) {
                    if (firstMove) {
                        updateInteraction(event);
                        if (interaction) {
                            cancelEvent(event);
                        }
                        startTouches = targetTouches(event.touches);
                    } else {
                        switch (interaction) {
                            case 'zoom':
                                if (startTouches.length == 2 && event.touches.length == 2) {
                                    target.handleZoom(event, calculateScale(startTouches, targetTouches(event.touches)));
                                }
                                break;
                            case 'drag':
                                target.handleDrag(event);
                                break;
                        }
                        if (interaction) {
                            cancelEvent(event);
                            target.update();
                        }
                    }

                    firstMove = false;
                }
            }, { passive: false });

            el.addEventListener('touchend', function (event) {
                if (target.enabled) {
                    fingers = event.touches.length;
                    updateInteraction(event);
                }
            });
        };

        return PinchZoom;
    };

    var PinchZoom = definePinchZoom();

    exports.default = PinchZoom;
});
