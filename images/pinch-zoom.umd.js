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

    // Optimized polyfills
    if (typeof Object.assign != 'function') {
        Object.defineProperty(Object, "assign", {
            value: function assign(target) {
                if (target == null) {
                    throw new TypeError('Cannot convert undefined or null to object');
                }

                var to = Object(target);
                for (var i = 1; i < arguments.length; i++) {
                    var nextSource = arguments[i];
                    if (nextSource != null) {
                        for (var key in nextSource) {
                            if (Object.prototype.hasOwnProperty.call(nextSource, key)) {
                                to[key] = nextSource[key];
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

    // Optimized utils
    var buildElement = function buildElement(str) {
        var tmp = document.implementation.createHTMLDocument('');
        tmp.body.innerHTML = str;
        return tmp.body.children[0];
    };

    var definePinchZoom = function definePinchZoom() {
        var PinchZoom = function PinchZoom(el, options) {
            this.el = el;
            this.zoomFactor = 1;
            this.lastScale = 1;
            this.offset = { x: 0, y: 0 };
            this.initialOffset = { x: 0, y: 0 };
            this.scrollContainer = null;
            this.options = Object.assign({}, this.defaults, options);
            
            // Cache DOM references
            this._window = window;
            this._document = document;
            
            this.setupMarkup();
            this.bindEvents();
            this.update();

            if (this.isImageLoaded(this.el)) {
                this.updateAspectRatio();
                this.setupOffsets();
            }

            this.enabled = true;
        };

        var sum = function sum(a, b) {
            return a + b;
        };

        var isCloseTo = function isCloseTo(value, expected) {
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

            handleDragStart: function handleDragStart(event) {
                this.stopAnimation();
                this.lastDragPosition = false;
                this.hasInteraction = true;
                this.handleDrag(event);
            },

            handleDrag: function handleDrag(event) {
                var touch = this.getTouches(event)[0];
                this.drag(touch, this.lastDragPosition);
                this.offset = this.sanitizeOffset(this.offset);
                this.lastDragPosition = touch;
            },

            handleDragEnd: function handleDragEnd() {
                this.end();
            },

            handleZoomStart: function handleZoomStart(event) {
                this.stopAnimation();
                this.lastScale = 1;
                this.nthZoom = 0;
                this.lastZoomCenter = false;
                this.hasInteraction = true;
            },

            handleZoom: function handleZoom(event, newScale) {
                var touchCenter = this.getTouchCenter(this.getTouches(event)),
                    scale = newScale / this.lastScale;
                this.lastScale = newScale;

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

            handleDoubleTap: function handleDoubleTap(event) {
                if (this.hasInteraction) return;

                var center = this.getTouches(event)[0],
                    zoomFactor = this.zoomFactor > 1 ? 1 : this.options.tapZoomFactor,
                    startZoomFactor = this.zoomFactor;

                var updateProgress = function (progress) {
                    this.scaleTo(startZoomFactor + progress * (zoomFactor - startZoomFactor), center);
                }.bind(this);

                this.isDoubleTap = true;
                this.animate(this.options.animationDuration, updateProgress, this.swing);
            },

            computeInitialOffset: function computeInitialOffset() {
                var elWidth = this.el.offsetWidth * this.getInitialZoomFactor();
                var elHeight = this.el.offsetHeight * this.getInitialZoomFactor();
                this.initialOffset = {
                    x: -Math.abs(elWidth - this.container.offsetWidth) / 2,
                    y: -Math.abs(elHeight - this.container.offsetHeight) / 2
                };
            },

            resetOffset: function resetOffset() {
                this.offset.x = this.initialOffset.x;
                this.offset.y = this.initialOffset.y;
            },

            isImageLoaded: function isImageLoaded(el) {
                if (el.nodeName === 'IMG') {
                    return el.complete && el.naturalHeight !== 0;
                } else {
                    var images = el.querySelectorAll('img');
                    for (var i = 0; i < images.length; i++) {
                        if (!images[i].complete || images[i].naturalHeight === 0) {
                            return false;
                        }
                    }
                    return true;
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

            sanitizeOffset: function sanitizeOffset(offset) {
                var elWidth = this.el.offsetWidth * this.getInitialZoomFactor() * this.zoomFactor;
                var maxX = elWidth - this.getContainerX() + this.options.horizontalPadding;
                var maxOffsetX = Math.max(maxX, 0);
                var minOffsetX = Math.min(maxX, 0) - this.options.horizontalPadding;

                return {
                    x: Math.min(Math.max(offset.x, minOffsetX), maxOffsetX),
                    y: offset.y
                };
            },

            scaleTo: function scaleTo(zoomFactor, center) {
                this.scale(zoomFactor / this.zoomFactor, center);
            },

            scale: function scale(_scale, center) {
                _scale = this.scaleZoomFactor(_scale);
                this.addOffset({
                    x: (_scale - 1) * (center.x + this.offset.x),
                    y: 0
                });
                this.scrollContainer.scrollTop += (_scale - 1) * (center.y + this.scrollContainer.scrollTop - this.initialOffset.y);
            },

            scaleZoomFactor: function scaleZoomFactor(scale) {
                var originalZoomFactor = this.zoomFactor;
                this.zoomFactor *= scale;
                this.zoomFactor = Math.min(this.options.maxZoom, Math.max(this.zoomFactor, this.options.minZoom));
                return this.zoomFactor / originalZoomFactor;
            },

            canDrag: function canDrag() {
                return this.options.draggableUnzoomed || !isCloseTo(this.zoomFactor, 1);
            },

            drag: function drag(center, lastCenter) {
                if (lastCenter) {
                    var deltaX = center.x - lastCenter.x;
                    var deltaY = center.y - lastCenter.y;
                    var totalZoomFactor = this.getInitialZoomFactor() * this.zoomFactor;

                    if (this.options.lockDragAxis) {
                        if (Math.abs(deltaX) > Math.abs(deltaY)) {
                            this.addOffset({ x: -deltaX * totalZoomFactor, y: 0 });
                        } else {
                            this.scrollContainer.scrollTop -= deltaY;
                        }
                    } else {
                        this.addOffset({ x: -deltaX * totalZoomFactor, y: 0 });
                        this.scrollContainer.scrollTop -= deltaY;
                    }
                }
            },

            getTouchCenter: function getTouchCenter(touches) {
                var x = 0, y = 0;
                for (var i = 0; i < touches.length; i++) {
                    x += touches[i].x;
                    y += touches[i].y;
                }
                return { x: x / touches.length, y: y / touches.length };
            },

            addOffset: function addOffset(offset) {
                this.offset.x += offset.x;
                this.offset.y += offset.y;
            },

            sanitize: function sanitize() {
                if (this.zoomFactor < this.options.zoomOutFactor) {
                    this.zoomOutAnimation();
                } else if (this.isInsaneOffset(this.offset)) {
                    this.sanitizeOffsetAnimation();
                }
            },

            isInsaneOffset: function isInsaneOffset(offset) {
                var sanitizedOffset = this.sanitizeOffset(offset);
                return sanitizedOffset.x !== offset.x || sanitizedOffset.y !== offset.y;
            },

            sanitizeOffsetAnimation: function sanitizeOffsetAnimation() {
                var targetOffset = this.sanitizeOffset(this.offset),
                    startOffset = { x: this.offset.x, y: this.offset.y };

                var updateProgress = function (progress) {
                    this.offset.x = startOffset.x + progress * (targetOffset.x - startOffset.x);
                    this.offset.y = startOffset.y + progress * (targetOffset.y - startOffset.y);
                    this.update();
                }.bind(this);

                this.animate(this.options.animationDuration, updateProgress, this.swing);
            },

            zoomOutAnimation: function zoomOutAnimation() {
                if (this.zoomFactor === 1) return;

                var startZoomFactor = this.zoomFactor,
                    zoomFactor = 1,
                    center = this.getCurrentZoomCenter();

                var updateProgress = function (progress) {
                    this.scaleTo(startZoomFactor + progress * (zoomFactor - startZoomFactor), center);
                }.bind(this);

                this.animate(this.options.animationDuration, updateProgress, this.swing);
            },

            updateAspectRatio: function updateAspectRatio() {
                this.setContainerY(this.el.offsetHeight);
            },

            getInitialZoomFactor: function getInitialZoomFactor() {
                var xZoomFactor = this.container.offsetWidth / this.el.offsetWidth;
                var yZoomFactor = this.container.offsetHeight / this.el.offsetHeight;
                return Math.min(xZoomFactor, yZoomFactor);
            },

            getCurrentZoomCenter: function getCurrentZoomCenter() {
                var offsetLeft = this.offset.x - this.initialOffset.x;
                var centerX = -1 * this.offset.x - offsetLeft / (1 / this.zoomFactor - 1);

                var offsetTop = this.offset.y - this.initialOffset.y;
                var centerY = -1 * this.offset.y - offsetTop / (1 / this.zoomFactor - 1);

                return { x: centerX, y: centerY };
            },

            getTouches: function getTouches(event) {
                var rect = this.scrollContainer.getBoundingClientRect();
                var scrollTop = this._document.documentElement.scrollTop || this._document.body.scrollTop;
                var scrollLeft = this._document.documentElement.scrollLeft || this._document.body.scrollLeft;
                var posTop = rect.top + scrollTop;
                var posLeft = rect.left + scrollLeft;

                var touches = event.touches;
                var result = [];
                for (var i = 0; i < touches.length; i++) {
                    result.push({
                        x: touches[i].pageX - posLeft,
                        y: touches[i].pageY - posTop
                    });
                }
                return result;
            },

            animate: function animate(duration, framefn, timefn, callback) {
                var startTime = Date.now();
                var self = this;

                var renderFrame = function () {
                    if (!self.inAnimation) return;

                    var frameTime = Date.now() - startTime;
                    var progress = frameTime / duration;

                    if (frameTime >= duration) {
                        framefn(1);
                        if (callback) callback();
                        self.update();
                        self.stopAnimation();
                        self.update();
                    } else {
                        if (timefn) progress = timefn(progress);
                        framefn(progress);
                        self.update();
                        self._window.requestAnimationFrame(renderFrame);
                    }
                };

                this.inAnimation = true;
                this._window.requestAnimationFrame(renderFrame);
            },

            stopAnimation: function stopAnimation() {
                this.inAnimation = false;
            },

            swing: function swing(p) {
                return -Math.cos(p * Math.PI) / 2 + 0.5;
            },

            getContainerX: function getContainerX() {
                return this.container.offsetWidth;
            },

            getContainerY: function getContainerY() {
                return this._window.innerHeight;
            },

            setContainerY: function setContainerY(y) {
                this.container.style.height = y + 'px';
            },

            unsetContainerY: function unsetContainerY() {
                this.container.style.height = null;
            },

            setupMarkup: function setupMarkup() {
                this.scrollContainer = buildElement('<div class="pinch-zoom-scroll-container"></div>');
                this.el.parentNode.insertBefore(this.scrollContainer, this.el);

                this.container = buildElement('<div class="pinch-zoom-container"></div>');
                this.scrollContainer.appendChild(this.container);
                this.container.appendChild(this.el);

                // Optimized style settings
                var scrollStyle = this.scrollContainer.style;
                scrollStyle.height = '100vh';
                scrollStyle.overflowY = 'auto';
                scrollStyle.webkitOverflowScrolling = 'touch';

                var containerStyle = this.container.style;
                containerStyle.overflow = 'visible';
                containerStyle.position = 'relative';
                containerStyle.height = this.el.offsetHeight + 'px';

                var elStyle = this.el.style;
                elStyle.transformOrigin = '0% 0%';
                elStyle.position = 'absolute';
                elStyle.width = '100%';
                elStyle.height = 'auto';
                elStyle.top = '0';
                elStyle.left = '0';
                elStyle.boxSizing = 'border-box';
                elStyle.willChange = 'transform';
            },

            end: function end() {
                this.hasInteraction = false;
                this.sanitize();
                this.update();
            },

            bindEvents: function bindEvents() {
                var self = this;
                detectGestures(this.container, this);

                this.resizeHandler = this.update.bind(this);
                this._window.addEventListener('resize', this.resizeHandler);

                var images = this.el.nodeName === 'IMG' ? [this.el] : this.el.querySelectorAll('img');
                for (var i = 0; i < images.length; i++) {
                    images[i].addEventListener('load', this.update.bind(this));
                }
            },

            update: function update(event) {
                if (this.updatePlanned) return;
                this.updatePlanned = true;

                var self = this;
                setTimeout(function () {
                    self.updatePlanned = false;

                    if (event && (event.type === 'resize' || event.type === 'load')) {
                        self.updateAspectRatio();
                        self.setupOffsets();
                    }

                    var zoomFactor = self.getInitialZoomFactor() * self.zoomFactor;
                    self.setContainerY(self.el.offsetHeight * zoomFactor);

                    var offsetX = -(self.offset.x / zoomFactor);
                    var offsetY = -(self.offset.y / zoomFactor);
                    var transform3d = 'scale3d(' + zoomFactor + ',' + zoomFactor + ',1) translate3d(' + offsetX + 'px,' + offsetY + 'px,0px)';
                    var transform2d = 'scale(' + zoomFactor + ',' + zoomFactor + ') translate(' + offsetX + 'px,' + offsetY + 'px)';

                    if (!self.options.use2d || self.hasInteraction || self.inAnimation) {
                        self.is3d = true;
                        if (self.clone) {
                            self.clone.parentNode.removeChild(self.clone);
                            self.clone = null;
                        }
                        self.el.style.transform = transform3d;
                        self.el.style.webkitTransform = transform3d;
                    } else {
                        if (self.is3d) {
                            self.clone = self.el.cloneNode(true);
                            self.clone.style.pointerEvents = 'none';
                            self.container.appendChild(self.clone);
                            setTimeout(function () {
                                if (self.clone) {
                                    self.clone.parentNode.removeChild(self.clone);
                                    self.clone = null;
                                }
                            }, 200);
                        }
                        self.el.style.transform = transform2d;
                        self.el.style.webkitTransform = transform2d;
                        self.is3d = false;
                    }
                }, 0);
            }
        };

        var detectGestures = function detectGestures(el, target) {
            var interaction = null,
                fingers = 0,
                lastTouchStart = null,
                startTouches = null;

            var setInteraction = function setInteraction(newInteraction, event) {
                if (interaction !== newInteraction) {
                    if (interaction) {
                        switch (interaction) {
                            case "zoom": target.handleZoomEnd(event); break;
                            case 'drag': target.handleDragEnd(event); break;
                        }
                    }

                    switch (newInteraction) {
                        case 'zoom': target.handleZoomStart(event); break;
                        case 'drag': target.handleDragStart(event); break;
                    }
                }
                interaction = newInteraction;
            };

            var updateInteraction = function updateInteraction(event) {
                if (fingers === 2) {
                    setInteraction('zoom');
                } else if (fingers === 1 && target.canDrag()) {
                    setInteraction('drag', event);
                } else {
                    setInteraction(null, event);
                }
            };

            var targetTouches = function targetTouches(touches) {
                var result = [];
                for (var i = 0; i < touches.length; i++) {
                    result.push({ x: touches[i].pageX, y: touches[i].pageY });
                }
                return result;
            };

            var getDistance = function getDistance(a, b) {
                var x = a.x - b.x;
                var y = a.y - b.y;
                return Math.sqrt(x * x + y * y);
            };

            var calculateScale = function calculateScale(startTouches, endTouches) {
                return getDistance(endTouches[0], endTouches[1]) / getDistance(startTouches[0], startTouches[1]);
            };

            var cancelEvent = function cancelEvent(event) {
                event.stopPropagation();
                event.preventDefault();
            };

            var detectDoubleTap = function detectDoubleTap(event) {
                var time = Date.now();

                if (fingers > 1) {
                    lastTouchStart = null;
                }

                if (time - lastTouchStart < 300) {
                    cancelEvent(event);
                    target.handleDoubleTap(event);
                    if (interaction) {
                        switch (interaction) {
                            case "zoom": target.handleZoomEnd(event); break;
                            case 'drag': target.handleDragEnd(event); break;
                        }
                    }
                } else {
                    target.isDoubleTap = false;
                }

                if (fingers === 1) {
                    lastTouchStart = time;
                }
            };

            var firstMove = true;

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
                        if (interaction) cancelEvent(event);
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
