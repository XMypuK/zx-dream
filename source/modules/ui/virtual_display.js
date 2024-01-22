function VirtualDisplay(container) {
	this._threading = VAL_THREADING_SINGLE;
	this._borderWidth = 16;
	this._scale = 2;
	this._scaleType = VAL_SCALE_METHOD_RENDER;
	this._rendererType = VAL_RENDERER_UNDEFINED;
	this._container = container;
	this._wrapper = null;
	this._border = null;
	this._screen5 = null;
	this._screen7 = null;
	this._onInitialized = new ZX_Event();
}
Object.assign(VirtualDisplay.prototype, {
	get_threading: function () {
		return this._threading;
	},
	set_threading: function (value) {
		this._threading = value;
	},
	get_borderWidth: function () {
		return this._borderWidth;
	},
	get_scale: function () {
		return this._scale;
	},
	get_scaleType: function () {
		return this._scaleType;
	},
	get_rendererType: function () {
		return this._rendererType;
	},
	get_border: function () {
		return this._border;
	},
	get_screen5: function () {
		return this._screen5;
	},
	get_screen7: function () {
		return this._screen7;
	},
	get_onInitialized: function() {
		return this._onInitialized.pub;
	},
	init: function (borderWidth, scale, scaleType, rendererType) {
		var borderWidthChanged = this._borderWidth !== borderWidth;
		var scaleChanged = this._scale !== scale;
		var scaleTypeChanged = this._scaleType !== scaleType;
		var rendererTypeChanged = this._rendererType !== rendererType;
		this._borderWidth = borderWidth;
		this._scale = scale;
		this._scaleType = scaleType;
		this._rendererType = rendererType;
		if (!this._border || borderWidthChanged || scaleChanged) {
			this._destroyBorderCanvas();
			this._destroyWrapper();
			this._createWrapper();
			this._createBorderCanvas();
		}
		if (!this._border || borderWidthChanged || scaleChanged || scaleTypeChanged || rendererTypeChanged) {
			this._destroyScreenCanvases();
			this._createScreenCanvases();
			this._ensureCanvasStructure();
			this._onInitialized.emit({
				borderWidth: this._borderWidth,
				scale: this._scale,
				scaleType: this._scaleType,
				rendererType: this._rendererType,
				canvases: this._threading == VAL_THREADING_SINGLE
					? [this._border, this._screen5, this._screen7]
					: [this._border, this._screen5]
			});
		}
	},
	_createWrapper: function () {
		if (!this._wrapper) {
			this._wrapper = document.createElement('div');
			this._wrapper.style.width = (2 * this._borderWidth + 256) * this._scale + 'px';
			this._wrapper.style.height = (2 * this._borderWidth + 192) * this._scale + 'px';
			this._wrapper.style.padding = '0 0 0 0';
			this._wrapper.style.margin = '0 0 0 0';
			this._wrapper.style.position = 'relative';
			this._container.appendChild(this._wrapper);
			this._border && this._wrapper.appendChild(this._border);
			this._screen5 && this._wrapper.appendChild(this._screen5);
			this._screen7 && this._wrapper.appendChild(this._screen7);
		}
	},
	_createBorderCanvas: function () {
		if (!this._border) {
			this._border = this._createCanvas(0, 0, 2 * this._borderWidth + 256, 2 * this._borderWidth + 192, this._scale, 1);
			this._border.setAttribute('ref', 'border');
		}
	},
	_createScreenCanvases: function () {
		var pixelScale = ( this._scaleType == VAL_SCALE_METHOD_PRE || this._scaleType == VAL_SCALE_METHOD_RENDER ) ? this._scale : 1;
		var cssScale = ( this._scaleType == VAL_SCALE_METHOD_POST ) ? this._scale : 1;
		if (!this._screen5) {
			this._screen5 = this._createCanvas(this._borderWidth, this._borderWidth, 256, 192, pixelScale, cssScale);
			this._screen5.setAttribute('ref', 'screen5');
		}
		if (!this._screen7 && this._threading == VAL_THREADING_SINGLE) {
			this._screen7 = this._createCanvas(this._borderWidth, this._borderWidth, 256, 192, pixelScale, cssScale);
			this._screen7.setAttribute('ref', 'screen7')
		}
	},
	_createCanvas: function (offsetX, offsetY, width, height, pixelScale, cssScale) {
		var canvas = document.createElement('canvas');
		canvas.width = width * pixelScale;
		canvas.height = height * pixelScale;
		canvas.style.position = 'absolute';
		canvas.style.left = offsetX * pixelScale * cssScale + 'px';
		canvas.style.top = offsetY * pixelScale * cssScale + 'px';
		canvas.style.width = width * pixelScale * cssScale + 'px';
		canvas.style.height = height * pixelScale * cssScale + 'px';
		return canvas;
	},
	_ensureCanvasStructure: function () {
		if (this._wrapper) {
			var nodes = [];
			this._border && nodes.push(this._border);
			this._screen5 && nodes.push(this._screen5);
			this._screen7 && nodes.push(this._screen7);
			var invalidStructure = nodes.length != this._wrapper.children.length;
			for ( var i = 0; !invalidStructure && i < nodes.length; i++ ) {
				invalidStructure = nodes[i] != this._wrapper.children[i];
			}
			if (invalidStructure) {
				var children = Array.prototype.slice.call(this._wrapper.children, 0);
				for (var i = 0; i < children.length; i++) {
					this._wrapper.removeChild(children[i]);
				}
				for (var i = 0; i < nodes.length; i++) {
					this._wrapper.appendChild(nodes[i]);
				}
			}
		}
	},
	_destroyWrapper: function () {
		if (this._wrapper) {
			var children = Array.prototype.slice.call(this._wrapper.children, 0);
			for (var i = 0; i < children.length; i++) {
				this._wrapper.removeChild(children[i]);
			}
			this._wrapper.remove();
			this._wrapper = null;
		}
	},
	_destroyBorderCanvas: function () {
		if (this._border) {
			this._border.remove();
			this._border = null;
		}
	},
	_destroyScreenCanvases: function () {
		if (this._screen5) {
			this._screen5.remove();
			this._screen5 = null;
		}
		if (this._screen7) {
			this._screen7.remove();
			this._screen7 = null;
		}
	}
});
