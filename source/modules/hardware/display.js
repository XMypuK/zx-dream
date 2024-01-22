// экран 256 x 192
// 6144 (0x1800) байт под пикселы
// 768 (0x300) байт под цвета знакомест
// 6912 (0x1b00) байт всего

// соответствие координат и памяти экрана:

// address: 010p pyyy rrrx xxxx
// point.y: pprr ryyy
// point.x: xxxx xbbb

// pp (0-2) - часть экрана (верхняя, средняя, нижняя)
// rrr (0-7) - вертикальное знакоместо относительно части экрана
// yyy (0-7) - номер строки относительно знакоместа
// xxxxx (0-31) - байт в строке
// bbb (0-7) - бит в байте (начиная со старшего!)

function ZX_Display () {
	'use strict';
	
	var _threading = VAL_THREADING_SINGLE;
	var _borderWidth = 16;
	var _scale = 2;
	var _scaleType = VAL_SCALE_METHOD_RENDER;
	var _rendererType = VAL_RENDERER_UNDEFINED;
	var _semicolors = false;
	var _flashInversion = false;
	var _flashInterval = 512;
	var _renderOnAnimationFrame = false;

	var _bus = null;
	var _clock = null;
	var _port_7ffd_value = 0x00;
	var _port_fe_value = 0x00;
	var _borderChanged = false;
	var _extendedMemory = VAL_EXTENDED_MEMORY_OFF;

	var _renderer = new NullRenderer();
	var _screen5Data = new Uint8Array(0x1B00);
	var _screen5Dirty = new Uint8Array(0x1800);
	var _screen7Data = new Uint8Array(0x1B00);
	var _screen7Dirty = new Uint8Array(0x1800);
	var _deferredData = new Uint8Array(0x1B00);
	var _deferredDirty = new Uint8Array(0x1800);

	function initRenderer() {
		switch ( _rendererType ) {
			case VAL_RENDERER_PUT_IMAGE_DATA: _renderer = new PutImageDataRenderer(_borderWidth, _scale, _scaleType); break;
			case VAL_RENDERER_DRAW_IMAGE: _renderer = new DrawImageRenderer(_borderWidth, _scale, _scaleType); break;
			case VAL_RENDERER_WEB_GL: _renderer = new WebGLRenderer(_borderWidth, _scale, _scaleType); break;
			default: _renderer = new NullRenderer(_borderWidth, _scale, _scaleType); break;
		}
		_renderer.set_threading(_threading);
	}

	function bind(canvases) {
		_renderer && _renderer.bind(canvases);
		_borderChanged = true;
		_screen5Dirty.fill(1);
		_screen7Dirty.fill(1);
	}

	function flashLoop() {
		_flashInversion = !_flashInversion;
		for (var address = 0x1800; address < 0x1B00; address++) {
			if (_screen5Data[address] & 0x80) {
				var topLeftAddress = ((address << 3) & 0x1800) | (address & 0x00FF);
				_screen5Dirty[topLeftAddress + 0x0000] = 1;
				_screen5Dirty[topLeftAddress + 0x0100] = 1;
				_screen5Dirty[topLeftAddress + 0x0200] = 1;
				_screen5Dirty[topLeftAddress + 0x0300] = 1;
				_screen5Dirty[topLeftAddress + 0x0400] = 1;
				_screen5Dirty[topLeftAddress + 0x0500] = 1;
				_screen5Dirty[topLeftAddress + 0x0600] = 1;
				_screen5Dirty[topLeftAddress + 0x0700] = 1;
			}
			if (_screen7Data[address] & 0x80) {
				var topLeftAddress = ((address << 3) & 0x1800) | (address & 0x00FF);
				_screen7Dirty[topLeftAddress + 0x0000] = 1;
				_screen7Dirty[topLeftAddress + 0x0100] = 1;
				_screen7Dirty[topLeftAddress + 0x0200] = 1;
				_screen7Dirty[topLeftAddress + 0x0300] = 1;
				_screen7Dirty[topLeftAddress + 0x0400] = 1;
				_screen7Dirty[topLeftAddress + 0x0500] = 1;
				_screen7Dirty[topLeftAddress + 0x0600] = 1;
				_screen7Dirty[topLeftAddress + 0x0700] = 1;
			}
		}
	}

	function beginRedraw(intrqVar, intrqActive) {
		if (!intrqActive)
			return;
		var layer = +!!(_port_7ffd_value & 0x08);
		var data = layer ? _screen7Data : _screen5Data;
		var dirty = layer ? _screen7Dirty : _screen5Dirty;

		if (_threading == VAL_THREADING_SINGLE) {
			if (_renderOnAnimationFrame) {
				// (копирование буферов понижает производительность)
				_deferredData.set(data);
				_deferredDirty.set(dirty);
				requestAnimationFrame(function () {
					endRedrawInMainThread(layer, _deferredData, _deferredDirty, _flashInversion, _semicolors);
				});
			}
			else {
				endRedrawInMainThread(layer, data, dirty, _flashInversion, _semicolors);
			}
		}
		else {
			_renderer.drawData(layer, data, dirty, _flashInversion, _semicolors);
			if (_renderOnAnimationFrame) {
				requestAnimationFrame(function () {
					endRedrawInDedicatedThread(layer);
				});
			}
			else {
				endRedrawInDedicatedThread(layer);
			}
		}
	}

	function endRedrawInMainThread(layer, data, dirty, flashInversion, semicolors) {
		_renderer.drawData(layer, data, dirty, flashInversion, semicolors);
		_renderer.displayLayer(layer);
		if (_borderChanged) {
			_borderChanged = false;
			var 
				attrs = _port_fe_value & 0x07,
				borderColor = ZX_Display.getColor(!_semicolors, attrs & 0x02, attrs & 0x04, attrs & 0x01);

			_renderer.drawBorder(borderColor);
		}
	}

	function endRedrawInDedicatedThread(layer) {
		_renderer.copyLayerToScreen(layer);
		if (_borderChanged) {
			_borderChanged = false;
			var 
				attrs = _port_fe_value & 0x07,
				borderColor = ZX_Display.getColor(!_semicolors, attrs & 0x02, attrs & 0x04, attrs & 0x01);

			_renderer.drawBorder(borderColor);
		}
	}

	function write(address, data) {
		var page = -1;
		if (address >= 0x4000 && address < 0x8000) {
			page = 5;
		}
		else if (address >= 0xC000) {
			page = (_extendedMemory == VAL_EXTENDED_MEMORY_PENTAGON)
				? ((_port_7ffd_value & 0xC0) >> 3) | (_port_7ffd_value & 0x07)
				: _port_7ffd_value & 0x07;
		}
		address &= 0x3FFF;
		if (address >= 0x1B00 || page != 5 && page != 7)
			return;

		var screenData, screenDirty;
		if (page == 5) {
			screenData = _screen5Data;
			screenDirty = _screen5Dirty;
		}
		else {
			screenData = _screen7Data;
			screenDirty = _screen7Dirty;
		}
		if (screenData[address] == data)
			return;

		screenData[address] = data;
		if (address < 0x1800) {
			screenDirty[address] = 1;
		}
		else {
			var topLeftAddress = ((address << 3) & 0x1800) | (address & 0x00FF);
			screenDirty[topLeftAddress + 0x0000] = 1;
			screenDirty[topLeftAddress + 0x0100] = 1;
			screenDirty[topLeftAddress + 0x0200] = 1;
			screenDirty[topLeftAddress + 0x0300] = 1;
			screenDirty[topLeftAddress + 0x0400] = 1;
			screenDirty[topLeftAddress + 0x0500] = 1;
			screenDirty[topLeftAddress + 0x0600] = 1;
			screenDirty[topLeftAddress + 0x0700] = 1;						
		}
	}

	function var_write_port_7ffd_value(name, value) {
		_port_7ffd_value = value;
	}

	function var_write_port_fe_value(name, value) {
		_borderChanged = _borderChanged || (( _port_fe_value ^ value ) & 0x07 );
		_port_fe_value = value;
	}

	this.force_redraw = beginRedraw;

	this.set_border_text = function(text) {
		var
			attrs = _port_fe_value & 0x07,
			textColor = ZX_Display.getColor(!_semicolors, !(attrs & 0x02), !(attrs & 0x04), !(attrs & 0x01));

		_renderer.drawBorderText(text, textColor);
	}

	function opt_extendedMemory(name, value) {
		if ( _extendedMemory !== value ) {
			_extendedMemory = value;
		}
	}

	function opt_renderingParams(name, value) {
		var recreateRenderer = !_renderer 
			|| _scale != value.scale 
			|| _scaleType != value.scaleType 
			|| _rendererType != value.rendererType;

		_scale = value.scale;
		_scaleType = value.scaleType;
		_rendererType = value.rendererType;
		_renderOnAnimationFrame = value.renderOnAnimationFrame;
		if (recreateRenderer) {
			initRenderer();
		}
	}

	function opt_semicolors(name, value) {
		if (_semicolors != value) {
			_semicolors = value;
			_borderChanged = true;
			_screen5Dirty.fill(1);
			_screen7Dirty.fill(1);
		}
	}

	this.connect = function (bus, clock) {
		_bus = bus;
		_clock = clock;
		bus.on_mem_write(write, { range: { begin: 0x4000, end: 0x5AFF } });
		bus.on_mem_write(write, { range: { begin: 0xC000, end: 0xDAFF } });
		bus.on_var_write(var_write_port_7ffd_value, 'port_7ffd_value');
		bus.on_var_write(var_write_port_fe_value, 'port_fe_value');
		bus.on_var_write(beginRedraw, 'intrq');
		bus.on_var_write(function (name, value) {
			this.set_border_text('~ ' + value.frequency .toFixed(2) + ' MHz  ' + Math.round(value.fps) + ' FPS');
		}.bind(this), 'performance');
		bus.on_opt(opt_extendedMemory, OPT_EXTENDED_MEMORY);
		bus.on_opt(opt_renderingParams, OPT_RENDERING_PARAMS);
		bus.on_opt(opt_semicolors, OPT_SEMICOLORS);
		_clock.setInterval(flashLoop, _flashInterval, 0);
		initRenderer();
	}

	this.bind = bind;
	this.get_threading = function () {
		return _threading;
	}
	this.set_threading = function (value) {
		_threading = value;
	}
}
Object.assign(ZX_Display, {
	getColor: function (bright, r, g, b) {
		return [
			r ? ( bright ? 0xff : 0xbf ) : 0x00,
			g ? ( bright ? 0xff : 0xbf ) : 0x00,
			b ? ( bright ? 0xff : 0xbf ) : 0x00,
			0xff
		];
	},
	getColorsByAttrs: function (attrs) {
		return {
			forecolor: ZX_Display.getColor(attrs & 0x40, attrs & 0x02, attrs & 0x04, attrs & 0x01),
			backcolor: ZX_Display.getColor(attrs & 0x40, attrs & 0x10, attrs & 0x20, attrs & 0x08)
		};
	},
	inversionTable: (function () {
		var it = new Uint8Array(0x100);
		for ( var attrs = 0; attrs <= 0xFF; attrs++ ) {
			it[attrs] = (attrs & 0x80)
				? (attrs & 0x40) | ((attrs << 3) & 0x38) | ((attrs >> 3) & 0x07)
				: attrs;
		}
		return it;
	})()
});

/*
	Renderer interface:

	methods:
		void bind( Array canvases )
			Binds output canvases to the renderer. There can be either 2 or 3 canvases depending on the mode activated at the moment.
			For code which is performing in the main ui thread there will be three canvases: border, screen5, screen7.
			For code which is performing in the dedicated worker thread it will be only two offscreen canvases: border and screen.

		void drawBorder( vec4 color )
			Fills the border with the specific color.

		void drawBorderText( string text, vec4 color )
			Draws the text on the top border area with the specific color.

		void drawData( Number layer, Uint8Array data, Uint8Array dirty, Boolean flashInversion, Boolean semicolors)
			Renders data which has been changed from the last rendering on the corresponding canvas (it can be output canvas or
			intermediate offscreen canvas).

		void displayLayer( Number layer )
			Adjusts visibility of canvases of screen5 and screen7 depending on the layer parameter. (For main UI thread.)

		void copyLayerToScreen( Number layer )
			Renders intermediate layer canvas on the output screen canvas. (For dedicated worker thread.)
*/

function RendererBase(borderWidth, scale, scaleType) {
	this._threading = VAL_THREADING_SINGLE;
	this._scale = scale;
	this._scaleType = scaleType;
	this._borderWidth = borderWidth;
	this._lastBorderColor = [0, 0, 0, 255];
	this._lastBorderTextWidth = 0;
	this._border = null;
	this._screen = null;
	this._layer0 = null;
	this._layer1 = null;
	this._borderCtx = null;
	this._screenCtx = null;
	this._buildSamples();
}
Object.assign(RendererBase.prototype, {
	get_threading: function () {
		return this._threading;
	},
	set_threading: function (value) {
		this._threading = value;
	},
	_createCanvas: function (width, height) {
		if (typeof OffscreenCanvas !== 'undefined') {
			return new OffscreenCanvas(width, height);
		}
		else if (typeof window !== 'undefined') {
			var canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			return canvas;
		}
		else
			throw new Error(ZX_Lang.ERR_CANNOT_CREATE_CANVAS);
	},
	_buildSamples: function () {

	},
	bind: function (canvases) {
		this._border = canvases[0];
		this._borderCtx = this._border.getContext('2d', { alpha: false });
		if (this._threading == VAL_THREADING_MULTIPLE) {
			this._screen = canvases[1];
			this._screenCtx = this._screen.getContext('2d', { alpha: false });
			this._layer0 = this._createCanvas(this._screen.width, this._screen.height);
			this._layer1 = this._createCanvas(this._screen.width, this._screen.height);
		}
		else {
			this._layer0 = canvases[1];
			this._layer1 = canvases[2];
		}
	},
	drawBorder: function (color) {
		if ( !this._borderCtx )
			return;

		var 
			scale = this._scale,
			ctx = this._borderCtx,
			bw = this._borderWidth * scale,
			sw = 256 * scale,
			sh = 192 * scale;

		ctx.fillStyle = 'rgba(' + color.join(',') + ')';
		ctx.beginPath();
		ctx.rect(0, 0, bw + sw + bw, bw);
		ctx.rect(0, bw, bw, sh);
		ctx.rect(bw + sw, bw, bw, sh);
		ctx.rect(0, bw + sh, bw + sw + bw, bw);
		ctx.closePath();
		ctx.fill();

		this._lastBorderColor = color.slice(0, 4);
	},
	drawBorderText: function( text, color ) { 
		if ( !this._borderCtx )
			return;

		var
			scale = this._scale,
			ctx = this._borderCtx,
			bw = this._borderWidth * scale,
			sw = 256 * scale,
			rectW = bw + sw + bw,
			rectH = bw,
			textH = 10,
			textXMargin = 5 * scale;

		ctx.font = textH + 'px sans-serif';
		var 
			textW = ctx.measureText(text).width,
			textY = +(( rectH - textH ) / 2).toFixed(0),
			textX = textXMargin;

		ctx.fillStyle = 'rgba(' + this._lastBorderColor.join(',') + ')';
		ctx.fillRect(textX, textY, this._lastBorderTextWidth, textH);

		ctx.fillStyle = 'rgba(' + color.join(',') + ')';
		ctx.fillText(text, textX, textY + textH, rectW - 2 * textXMargin);

		this._lastBorderTextWidth = textW;
	},
	drawData: function (layer, data, dirty, flashInversion, semicolors) {
	},
	displayLayer: function (layer) {
		this._layer1 && (this._layer1.style.opacity = layer ? 1.0 : 0.0);
	},
	copyLayerToScreen: function (layer) {
		this._screenCtx && this._screenCtx.drawImage(layer ? this._layer1 : this._layer0, 0, 0);
	}
});

function NullRenderer() {
	NullRenderer.superclass.constructor.apply(this, arguments);
}
extend(NullRenderer, RendererBase);

function PutImageDataRenderer() {
	this._samples = [];
	this._layer0Ctx = null;
	this._layer1Ctx = null;
	PutImageDataRenderer.superclass.constructor.apply(this, arguments);
}
extend(PutImageDataRenderer, RendererBase);
Object.assign(PutImageDataRenderer.prototype, {
	_buildSamples: function() {
		var 
			samples = [],
			scale = ( this._scaleType == VAL_SCALE_METHOD_PRE ) ? this._scale : 1,
			sampleWidth = 8 * scale,
			sampleHeight = 1 * scale;

		var sampleCanvas = this._createCanvas(0x100 * sampleWidth, 0x80 * sampleHeight);
		var sampleContext = sampleCanvas.getContext('2d', { alpha: false });

		/* very very slow in IE */
		for ( var attrs = 0; attrs < 0x80; attrs++ ) {
			var colors = ZX_Display.getColorsByAttrs(attrs);
			for ( var bits = 0; bits < 0x100; bits++ ) {
				var sample = sampleContext.createImageData(sampleWidth, sampleHeight);
				var dataIndex = 0;

				for ( var y = 0; y < scale; y++ ) {
					for ( var bit = 0; bit < 8; bit++ ) {
						var color = ( bits & ( 0x80 >> bit )) ? colors.forecolor : colors.backcolor;

						for ( var x = 0; x < scale; x++ ) {
							sample.data[dataIndex++] = color[0];
							sample.data[dataIndex++] = color[1];
							sample.data[dataIndex++] = color[2];
							sample.data[dataIndex++] = color[3];
						}
					}					
				}

				samples[( attrs << 8 ) | bits] = sample;
			}
		}

		this._samples = samples;
	},
	bind: function (canvases) {
		PutImageDataRenderer.superclass.bind.call(this, canvases);
		this._layer0Ctx = this._layer0.getContext('2d', { alpha: false });
		this._layer1Ctx = this._layer1.getContext('2d', { alpha: false });
	},
	drawData: function (layer, data, dirty, flashInversion, semicolors) {
		var 
			sampleScale = ( this._scaleType == VAL_SCALE_METHOD_PRE ) ? this._scale : 1,
			semicolorsMask = semicolors ? 0x00 : 0x40,
			flashInversionMask = flashInversion ? 0xFF : 0x7F,
			ctx = layer ? this._layer1Ctx : this._layer0Ctx;

		if (ctx) {
			for (var address = 0; address < 0x1800; address++) {
				if (dirty[address]) {
					var 
						x = (address & 0x1F) << 3, // 0, 8, 16, ..., 240
						y = ((address >> 5) & 0xC0) | ((address >> 2) & 0x38) | ((address >> 8) & 0x07), // 0, 1, 2, ..., 191
						attr = ZX_Display.inversionTable[data[0x1800 | ((address >> 3) & 0x0300) | (address & 0xFF)] & flashInversionMask | semicolorsMask],
						dx = x * sampleScale, 
						dy = y * sampleScale, 
						sampleIndex = (attr << 8) | data[address];

					ctx.putImageData(this._samples[sampleIndex], dx, dy);
					dirty[address] = 0;
				}
			}
		}
	}
});

function DrawImageRenderer() {
	this._samples = null;
	this._sampleParams = {
		width: 8,
		height: 1,
		stepX: 10,
		stepY: 3
	};
	this._layer0Ctx = null;
	this._layer1Ctx = null;
	DrawImageRenderer.superclass.constructor.apply(this, arguments);
}
extend(DrawImageRenderer, RendererBase);
Object.assign(DrawImageRenderer.prototype, {
	_buildSamples: function () {
		/*
			All browsers except Google Chrome calculate pixel color basing on neighbor pixels
			so we need to dublicate boundary pixels in order to get correct colors.

			x         x         x         x
			0         10        20        30

		y0	******************************...
			*sample00**sample01**sample02*...
			******************************...
		y3	******************************...
			*sample10**sample11**sample12*...
			******************************...
		y4	.................................

		*/
		var sampleScale = ( this._scaleType == VAL_SCALE_METHOD_PRE ) ? this._scale : 1;
		var sampleParams = {
			width: 8 * sampleScale,
			height: 1 * sampleScale,
			stepX: 8 * sampleScale + 2, // 8 точек сэмпла и 2 обрамляющих точки
			stepY: 1 * sampleScale + 2 // 1 точка сэмпла и 2 обрамляющих точки
		};

		var samples = this._createCanvas(0x100 * sampleParams.stepX, 0x80 * sampleParams.stepY);
		var samplesContext = samples.getContext('2d', { alpha: false });
		var samplesData = samplesContext.createImageData(samples.width, samples.height);

		var state = {
			data: samplesData.data,
			dataIndex: 0,
			attrs: 0
		};
		for ( state.attrs = 0; state.attrs < 0x80; state.attrs++ ) {
			generateSampleLine(state);
			for ( var i = 0; i < sampleScale; i++ ) {
				generateSampleLine(state);
			}
			generateSampleLine(state);
		}
		samplesContext.putImageData(samplesData, 0, 0);

		this._samples = samples;
		this._sampleParams = sampleParams;

		function generateSampleLine( state ) {
			var colors = ZX_Display.getColorsByAttrs(state.attrs);
			for ( var pixels = 0; pixels < 0x100; pixels++ ) {
				for ( var pixel = 0; pixel < 8; pixel++ ) {
					var color = ( pixels & ( 0x80 >> pixel )) ? colors.forecolor : colors.backcolor;

					if ( pixel == 0 ) {
						state.data[state.dataIndex++] = color[0];
						state.data[state.dataIndex++] = color[1];
						state.data[state.dataIndex++] = color[2];
						state.data[state.dataIndex++] = color[3];
					}

					for ( var i = 0; i < sampleScale; i++ ) {
						state.data[state.dataIndex++] = color[0];
						state.data[state.dataIndex++] = color[1];
						state.data[state.dataIndex++] = color[2];
						state.data[state.dataIndex++] = color[3];
					}

					if ( pixel == 7 ) {
						state.data[state.dataIndex++] = color[0];
						state.data[state.dataIndex++] = color[1];
						state.data[state.dataIndex++] = color[2];
						state.data[state.dataIndex++] = color[3];
					}
				}
			}
		}
	},
	_initImageData: function (context, width, height) {
		var data = context.createImageData(width, height);
		context.putImageData(data, 0, 0);
	},
	bind: function (canvases) {
		DrawImageRenderer.superclass.bind.call(this, canvases);
		this._layer0Ctx = this._layer0.getContext('2d', { alpha: false });
		this._layer1Ctx = this._layer1.getContext('2d', { alpha: false });
		this._initImageData(this._borderCtx, this._border.width, this._border.height);
		this._initImageData(this._layer0Ctx, this._layer0.width, this._layer0.height);
		this._initImageData(this._layer1Ctx, this._layer1.width, this._layer1.height);
	},
	drawData: function (layer, data, dirty, flashInversion, semicolors) {
		var 
			renderScale = ( this._scaleType == VAL_SCALE_METHOD_PRE || this._scaleType == VAL_SCALE_METHOD_RENDER ) ? this._scale : 1,
			sampleParams = this._sampleParams,
			w = 8 * renderScale,
			h = 1 * renderScale,
			semicolorsMask = semicolors ? 0x00 : 0x40,
			flashInversionMask = flashInversion ? 0xFF : 0x7F,
			ctx = layer ? this._layer1Ctx : this._layer0Ctx;
			
		if (ctx) {
			for (var address = 0; address < 0x1800; address++) {
				if (dirty[address]) {
					var 
						x = (address & 0x1F) << 3, // 0, 8, 16, ..., 240
						y = ((address >> 5) & 0xC0) | ((address >> 2) & 0x38) | ((address >> 8) & 0x07), // 0, 1, 2, ..., 191
						attr = ZX_Display.inversionTable[data[0x1800 | ((address >> 3) & 0x0300) | (address & 0xFF)] & flashInversionMask | semicolorsMask],
						dx = x * renderScale, 
						dy = y * renderScale, 
						sx = data[address] * sampleParams.stepX + 1,
						sy = attr * sampleParams.stepY + 1;
						
					ctx.drawImage(this._samples, sx, sy, sampleParams.width, sampleParams.height, dx, dy, w, h);
					dirty[address] = 0;
				}
			}
		}
	}
});

function WebGLRenderer() {
	this._samples = null;
	this._sampleParams = {
		width: 8,
		height: 1
	};
	this._glBuffer = new Float32Array(0x1800 * 24);
	WebGLRenderer.superclass.constructor.apply(this, arguments);
}
extend(WebGLRenderer, RendererBase);
Object.assign(WebGLRenderer.prototype, {
	_glGetContext: function (canvas, options) {
		var names = [ "webgl2", "webgl", "experimental-webgl" ];
		var glContext = null;
		for ( var i = 0; i < names.length && !glContext; i++ ) {
			try {
				glContext = canvas.getContext(names[i], options);
			}
			catch (e) {}
		}
		return glContext;
	},
	_glCreateShader: function ( glContext, shaderType, shaderSource ) {
		var shader = glContext.createShader(shaderType);
		glContext.shaderSource(shader, shaderSource);
		glContext.compileShader(shader);

		var compiled = glContext.getShaderParameter(shader, glContext.COMPILE_STATUS);
		if ( !compiled ) {
			var error = glContext.getShaderInfoLog(shader);
			glContext.deleteShader(shader);
			throw new Error(error);
		}

		return shader;
	},
	_glCreateAndLinkProgram: function ( glContext, shaders ) {
		var program = glContext.createProgram();
		for ( var i = 0; i < shaders.length; i++ ) {
			glContext.attachShader(program, shaders[i]);
		}

		glContext.linkProgram(program);

		var linked = glContext.getProgramParameter(program, glContext.LINK_STATUS);
		if ( !linked ) {
			var error = glContext.getProgramInfoLog(program);
			glContext.deleteProgram(program);
			throw new Error(error);
		}

		return program;
	},
	_vertexShaderSource: [
		"attribute vec4 a_params;",
		"attribute vec2 a_canvasResolution;",
		"attribute vec2 a_samplesResolution;",
		"varying vec2 v_sampleCoords;",

		"void main() {",
		"	vec2 clipCoords = (( a_params.xy / a_canvasResolution ) * 2.0 - 1.0) * vec2(1.0, -1.0);",
		"	gl_Position = vec4(clipCoords, 0.0, 1.0);",
		"	v_sampleCoords = a_params.pq / a_samplesResolution;",
		"}"
	].join('\r\n'),
	_fragmentShaderSource: [
	    "precision lowp float;",
        "uniform sampler2D u_samples;",
        "varying vec2 v_sampleCoords;",
	    
	    "void main() {",
	    "	gl_FragColor = texture2D(u_samples, v_sampleCoords);",
	    "}"
	].join('\r\n'),
	_glInitWebGLContext: function ( glContext ) {
		var vertexShader = this._glCreateShader(glContext, glContext.VERTEX_SHADER, this._vertexShaderSource);
		var fragmentShader = this._glCreateShader(glContext, glContext.FRAGMENT_SHADER, this._fragmentShaderSource);
		var program = this._glCreateAndLinkProgram(glContext, [vertexShader, fragmentShader]);
		glContext.useProgram(program);

	    var buffer = glContext.createBuffer();
	    glContext.bindBuffer(glContext.ARRAY_BUFFER, buffer);

		var paramsLocation = glContext.getAttribLocation(program, 'a_params');
		glContext.enableVertexAttribArray(paramsLocation);
		glContext.vertexAttribPointer(paramsLocation, 4, glContext.FLOAT, false, 0, 0);

		var canvasResolutionLocation = glContext.getAttribLocation(program, 'a_canvasResolution');
		glContext.vertexAttrib2f(canvasResolutionLocation, glContext.canvas.width, glContext.canvas.height);

		var samplesResolutionLocation = glContext.getAttribLocation(program, 'a_samplesResolution');
		glContext.vertexAttrib2f(samplesResolutionLocation, this._samples.width, this._samples.height);

	    var texture = glContext.createTexture();
	    glContext.bindTexture(glContext.TEXTURE_2D, texture);
	    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, glContext.CLAMP_TO_EDGE);
	    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, glContext.CLAMP_TO_EDGE);    
	    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.NEAREST);
	    glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, glContext.NEAREST);
	    glContext.texImage2D(glContext.TEXTURE_2D, 0, glContext.RGBA, glContext.RGBA, glContext.UNSIGNED_BYTE, this._samples);
	},
	_buildSamples: function () {
		/*
			x       x       x       x
			0       8       16      24

		y0	sample00sample01sample02...
		y1	sample10sample11sample12...
		y2	...........................

		*/
		var sampleScale = ( this._scaleType == VAL_SCALE_METHOD_PRE ) ? this._scale : 1;
		var sampleParams = {
			width: 8 * sampleScale,
			height: 1 * sampleScale
		}

		var samples = this._createCanvas(0x100 * sampleParams.width, 0x80 * sampleParams.height);
		var samplesContext = samples.getContext('2d', { alpha: false });
		var samplesData = samplesContext.createImageData(samples.width, samples.height);

		var state = {
			data: samplesData.data,
			dataIndex: 0,
			attrs: 0
		};
		for ( state.attrs = 0; state.attrs < 0x80; state.attrs++ ) {
			for ( var i = 0; i < sampleScale; i++ ) {
				generateSampleLine(state);
			}
		}

		samplesContext.putImageData(samplesData, 0, 0);

		this._samples = samples;
		this._sampleParams = sampleParams;

		function generateSampleLine( state ) {
			var colors = ZX_Display.getColorsByAttrs(state.attrs);
			for ( var pixels = 0; pixels < 0x100; pixels++ ) {
				for ( var pixel = 0; pixel < 8; pixel++ ) {
					var color = ( pixels & ( 0x80 >> pixel )) ? colors.forecolor : colors.backcolor;

					for ( var i = 0; i < sampleScale; i++ ) {
						state.data[state.dataIndex++] = color[0];
						state.data[state.dataIndex++] = color[1];
						state.data[state.dataIndex++] = color[2];
						state.data[state.dataIndex++] = color[3];
					}
				}
			}
		}		
	},
	bind: function (canvases) {
		WebGLRenderer.superclass.bind.call(this, canvases);
		this._layer0Ctx = this._glGetContext(this._layer0, { preserveDrawingBuffer: true, alpha: false });
		this._layer1Ctx = this._glGetContext(this._layer1, { preserveDrawingBuffer: true, alpha: false });
		if ( !this._layer0Ctx || !this._layer1Ctx )
			throw new Error(ZX_Lang.ERR_CANNOT_CREATE_CANVAS);

		this._glInitWebGLContext(this._layer0Ctx);
		this._glInitWebGLContext(this._layer1Ctx);
	},
	drawData: function (layer, data, dirty, flashInversion, semicolors) {
		var 
			renderScale = ( this._scaleType == VAL_SCALE_METHOD_PRE || this._scaleType == VAL_SCALE_METHOD_RENDER ) ? this._scale : 1,
			sampleParams = this._sampleParams,
			dw = 8 * renderScale,
			dh = 1 * renderScale,
			semicolorsMask = semicolors ? 0x00 : 0x40,
			flashInversionMask = flashInversion ? 0xFF : 0x7F,
			ctx = layer ? this._layer1Ctx : this._layer0Ctx;

		if (ctx) {
			var glBufferIndex = 0;
			for (var address = 0; address < 0x1800; address++) {
				if (dirty[address]) {
					var 
						x = (address & 0x1F) << 3, // 0, 8, 16, ..., 240
						y = ((address >> 5) & 0xC0) | ((address >> 2) & 0x38) | ((address >> 8) & 0x07), // 0, 1, 2, ..., 191
						attr = ZX_Display.inversionTable[data[0x1800 | ((address >> 3) & 0x0300) | (address & 0xFF)] & flashInversionMask | semicolorsMask],
						dl = x * renderScale,
						dr = dl + dw,
						dt = y * renderScale,
						db = dt + dh,
						sl = data[address] * sampleParams.width,
						sr = sl + sampleParams.width,
						st = attr * sampleParams.height,
						sb = st + sampleParams.height;

					this._glBuffer.set([
						dl, dt, sl, st,
						dr, dt, sr, st,
						dr, db, sr, sb,
						dl, dt, sl, st,
						dl, db, sl, sb,
						dr, db, sr, sb
					], glBufferIndex);
					glBufferIndex += 24;
					dirty[address] = 0;
				}
			}
			if (glBufferIndex) {
				ctx.bufferData(ctx.ARRAY_BUFFER, this._glBuffer, ctx.STATIC_DRAW);
				ctx.drawArrays(ctx.TRIANGLES, 0, glBufferIndex >> 2);
				ctx.flush();
			}
		}
	}
});
