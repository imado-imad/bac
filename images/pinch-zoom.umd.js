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
        ImadZoom.js - Modified version without container
        Based on original work by Manuel Stofer
        Version: 1.1.5-mod
    */

    // polyfills
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

    if (typeof Array.from != 'function') {
        Array.from = function (object) {
            return [].slice.call(object);
        };
    }

    var definePinchZoom = function definePinchZoom() {

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
            this.options = Object.assign({}, this.defaults, options);
            this.prepareElement();
            this.bindEvents();
            this.update();

            if (this.isImageLoaded(this.el)) {
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

            prepareElement: function prepareElement() {
                // Set necessary styles directly on the element
                this.el.style.transformOrigin = '0% 0%';
                this.el.style.position = 'relative'; // Changed from absolute to relative
                this.el.style.display = 'inline-block'; // Helps with positioning
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

            computeInitialOffset: function computeInitialOffset() {
                // Calculate offset based on element's natural position
                this.initialOffset = {
                    x: 0,
                    y: 0
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

            sanitizeOffset: function sanitizeOffset(offset) {
                var elWidth = this.el.offsetWidth * this.zoomFactor;
                var elHeight = this.el.offsetHeight * this.zoomFactor;
                var containerWidth = this.el.parentElement.offsetWidth;
                var containerHeight = this.el.parentElement.offsetHeight;
                
                var maxX = elWidth - containerWidth + this.options.horizontalPadding;
                var maxY = elHeight - containerHeight + this.options.verticalPadding;
                var maxOffsetX = Math.max(maxX, 0);
                var maxOffsetY = Math.max(maxY, 0);
                var minOffsetX = Math.min(maxX, 0) - this.options.horizontalPadding;
                var minOffsetY = Math.min(maxY, 0) - this.options.verticalPadding;

                return {
                    x: Math.min(Math.max(offset.x, minOffsetX), maxOffsetX),
                    y: Math.min(Math.max(offset.y, minOffsetY), maxOffsetY)
                };
            },

            scaleTo: function scaleTo(zoomFactor, center) {
                this.scale(zoomFactor / this.zoomFactor, center);
            },

            scale: function scale(_scale, center) {
                _scale = this.scaleZoomFactor(_scale);
                this.addOffset({
                    x: (_scale - 1) * (center.x + this.offset.x),
                    y: (_scale - 1) * (center.y + this.offset.y)
                });
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
                    if (this.options.lockDragAxis) {
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

            getTouchCenter: function getTouchCenter(touches) {
                return this.getVectorAvg(touches);
            },

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

            isInsaneOffset: function isInsaneOffset(offset) {
                var sanitizedOffset = this.sanitizeOffset(offset);
                return sanitizedOffset.x !== offset.x || sanitizedOffset.y !== offset.y;
            },

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

            getTouches: function getTouches(event) {
                var rect = this.el.getBoundingClientRect();
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

            stopAnimation: function stopAnimation() {
                this.inAnimation = false;
            },

            swing: function swing(p) {
                return -Math.cos(p * Math.PI) / 2 + 0.5;
            },

            end: function end() {
                this.hasInteraction = false;
                this.sanitize();
                this.update();
            },

            bindEvents: function bindEvents() {
                var self = this;
                detectGestures(this.el, this);

                this.resizeHandler = this.update.bind(this);
                window.addEventListener('resize', this.resizeHandler);
                
                if (this.el.nodeName === 'IMG') {
                    this.el.addEventListener('load', this.update.bind(this));
                } else {
                    Array.from(this.el.querySelectorAll('img')).forEach(function (imgEl) {
                        imgEl.addEventListener('load', self.update.bind(self));
                    });
                }
            },

            update: function update(event) {
                if (this.updatePlanned) {
                    return;
                }
                this.updatePlanned = true;

                window.setTimeout(function () {
                    this.updatePlanned = false;

                    var zoomFactor = this.zoomFactor,
                        offsetX = -this.offset.x / zoomFactor,
                        offsetY = -this.offset.y / zoomFactor,
                        transform3d = 'scale3d(' + zoomFactor + ', ' + zoomFactor + ',1) ' + 'translate3d(' + offsetX + 'px,' + offsetY + 'px,0px)',
                        transform2d = 'scale(' + zoomFactor + ', ' + zoomFactor + ') ' + 'translate(' + offsetX + 'px,' + offsetY + 'px)',
                        removeClone = function () {
                        if (this.clone) {
                            this.clone.parentNode.removeChild(this.clone);
                            delete this.clone;
                        }
                    }.bind(this);

                    if (!this.options.use2d || this.hasInteraction || this.inAnimation) {
                        this.is3d = true;
                        removeClone();

                        this.el.style.transform = transform3d;
                        this.el.style.webkitTransform = transform3d;
                    } else {
                        if (this.is3d) {
                            this.clone = this.el.cloneNode(true);
                            this.clone.style.pointerEvents = 'none';
                            this.el.parentNode.appendChild(this.clone);
                            window.setTimeout(removeClone, 200);
                        }

                        this.el.style.transform = transform2d;
                        this.el.style.webkitTransform = transform2d;
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
