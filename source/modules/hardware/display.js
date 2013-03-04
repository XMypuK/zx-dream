var ScreenConstants = {
	SCALE_TYPE_UNDEFINED: 0,
	SCALE_TYPE_PRE: 1, // scaling samples
	SCALE_TYPE_RENDER: 2, 
	SCALE_TYPE_POST: 3, // scaling by CSS

	RENDERER_TYPE_UNDEFINED: 0,
	RENDERER_TYPE_PUT_IMAGE_DATA: 1,
	RENDERER_TYPE_DRAW_IMAGE: 2,
	RENDERER_TYPE_WEB_GL: 3
}

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

var ScreenUtils = {
 	getPointCoordsByAddress: function ( address ) {
		// assert 0x0000 <= address < 0x1800
		return {
			x: ((address & 0x1f) << 3),
			y: (((address >> 11) & 0x03) << 6) | (((address >> 5) & 0x07) << 3) | ((address >> 8) & 0x07)
		}
	},

	getAddressByPointCoords: function ( point ) {
		return (((point.y >> 6) & 0x03) << 11) | (((point.y >> 3) & 0x07) << 5) | ((point.y & 0x07) << 8) | (point.x >> 3);
		// assert 0x0000 <= returnValue < 0x1800
	},

	// возвращает координаты знакоместа по координатам одной из его точек
	getRegionCoordsByPointCoords: function ( point ) {
		return { x: point.x >> 3, y: point.y >> 3 }
	},

	// возращает левую верхнюю точку знакоместа
	getPointCoordsByRegionCoords: function ( region ) {
		return { x: region.x << 3, y: region.y << 3 	}
	},

	getAddressByRegionCoords: function ( region ) {
		return 0x1800 | (region.y << 5) | region.x;
		// assert 0x1800 <= returnValue < 0x1b00
	},

	getRegionCoordsByAddress: function ( address ) {
		// assert 0x1800 <= address < 0x1b00
		address &= 0x03ff;
		var region = {};
		region.y = (address >> 5);
		region.x = address - (region.y << 5);
		return region;
	},

	// возвращает массив из восьми адресов, соответствующих точкам данного знакоместа
	getAddressesByRegionCoords: function ( region ) {
		var addresses = [];
		var firstPoint = ScreenUtils.getPointCoordsByRegionCoords(region);
		var firstPointAddress = ScreenUtils.getAddressByPointCoords(firstPoint);
		for ( var i = 0; i < 8; i++ ) {
			addresses[i] = firstPointAddress + ( 256 * i );
		}
		return addresses;
	},

	getColor: function ( bright, r, g, b ) {
		return [
			r ? ( bright ? 0xff : 0xbf ) : 0x00,
			g ? ( bright ? 0xff : 0xbf ) : 0x00,
			b ? ( bright ? 0xff : 0xbf ) : 0x00,
			0xff
		];
	},

	getBackgroundColorByAttrs: function ( attrs ) {
		return this.getColor( attrs & 0x40, attrs & 0x10, attrs & 0x20, attrs & 0x08 );
	},

	getForegroundColorByAttrs: function ( attrs ) {
		return this.getColor( attrs & 0x40, attrs & 0x02, attrs & 0x04, attrs & 0x01 );
	}
};

var WebGLUtils = {
	getWebGLContext: function ( canvas, options ) {
		var names = [ "webgl", "experimental-webgl" ];
		var glContext = null;
		for ( var i = 0; i < names.length && !glContext; i++ ) {
			try {
				glContext = canvas.getContext(names[i], options);
			}
			catch (e) {}
		}
		return glContext;
	},

	createShader: function ( glContext, shaderType, shaderSource ) {
		if ( !glContext ) {
			throw new Error('glContext is null');
		}

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

	createAndLinkProgram: function ( glContext, shaders ) {
		if ( !glContext ) {
			throw new Error('glContext is null');
		}

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
	}
};


function ZX_Display ( container ) {
	'use strict';
	
	var borderWidth = 16;
	var scale = 2;
	var scaleType = ScreenConstants.SCALE_TYPE_RENDER;
	var rendererType = ScreenConstants.RENDERER_TYPE_DRAW_IMAGE;	
	var semicolors = false;
	var flashInvertion = false;
	var flashInterval = 512;

	var inited = false;
	var port_7ffd_value = 0x00;
	var port_fe_value = 0x00;
	var borderChanged = false;
	var _bus = null;

	var renderer = null;

	var screen5 = new ScreenPage();
	screen5.layer = 0;

	var screen7 = new ScreenPage();
	screen7.layer = 1;

	function init() {
		setTimeout(flashLoop, flashInterval);
		recreateRenderer();
		inited = true;
	}

	function recreateRenderer() {
		if ( renderer ) {
			screen5.unbindRenderer();
			screen7.unbindRenderer();
			renderer.destroyCanvas();
			renderer = null;
		}

		switch ( rendererType ) {
			case ScreenConstants.RENDERER_TYPE_PUT_IMAGE_DATA: renderer = new PutImageDataRenderer(); break;
			case ScreenConstants.RENDERER_TYPE_DRAW_IMAGE: renderer = new DrawImageRenderer(); break;
			case ScreenConstants.RENDERER_TYPE_WEB_GL: renderer = new WebGLRenderer(); break;
		}
		screen5.bindRenderer(renderer);
		screen7.bindRenderer(renderer);

		recreateCanvas();
	}

	function recreateCanvas() {
		renderer.destroyCanvas();
		var eError = document.getElementById('renderer_error_message');
		if ( eError ) {
			eError.parentNode.removeChild(eError);
		}

		var success;
		try {
			renderer.createCanvas(container, borderWidth, scale, scaleType);
			success = true;
		}
		catch (err) {
			renderer.destroyCanvas();

			var eError = container.appendChild(document.createElement('div'));
			eError.id = 'renderer_error_message';
			eError.className = "error-message";
			eError.innerHTML = err;

			success = false;
		}

		if ( success ) {
			screen5.invalidate();
			screen7.invalidate();
			borderChanged = true;
		}
	}

	function flashLoop() {
		flashInvertion = !flashInvertion;
		screen5.flashInvertion = flashInvertion;
		screen7.flashInvertion = flashInvertion;
		setTimeout(flashLoop, flashInterval);
	}

	function redraw() {
		if ( !inited ) {
			init();
		}

		screen5.flush();
		screen7.flush();
		renderer.processQueue();

		if ( borderChanged ) {
			var 
				attrs = port_fe_value & 0x07,
				borderColor = ScreenUtils.getColor( !semicolors, attrs & 0x02, attrs & 0x04, attrs & 0x01 );

			renderer.drawBorder(borderColor);
			borderChanged = false;
		}

		renderer.setVisibleLayer( (port_7ffd_value & 0x08) ? 1 : 0 );
	}


	var device = new ZX_Device({
		id: 'display',
		reset: function( bus ) {
			_bus = bus;
		},
		event: function( name, options, bus ) {
			_bus = bus;

			if (!inited) {
				init();
			}

			if ( name == 'var_changed' ) {
				switch ( options.name ) {
					case 'port_7ffd_value': port_7ffd_value = options.value; break;
					case 'port_fe_value':
						borderChanged = borderChanged || (( port_fe_value ^ options.value ) & 0x07 );
						port_fe_value = options.value;
						break;
				}
			}
			else if ( name == 'wr_scr_5' ) {
				screen5.write(options.address, options.data);
			}
			else if ( name == 'wr_scr_7' ) {
				screen7.write(options.address, options.data);
			}
		}
	});

	device.semicolors = function( value ) {
		if ( value !== undefined ) {
			semicolors = value;
			borderChanged = true;

			screen5.semicolors = semicolors;
			screen5.invalidate();

			screen7.semicolors = semicolors;
			screen7.invalidate();
		}
		else {
			return value;
		}
	}

	device.redraw = redraw;

	device.set_border_text = function( text ) {
		var
			attrs = port_fe_value & 0x07,
			textColor = ScreenUtils.getColor( !semicolors, !(attrs & 0x02), !(attrs & 0x04), !(attrs & 0x01) );

		renderer.drawBorderText(text, textColor);
	}

	device.rendererType = function ( type ) {
		if ( type !== undefined ) {
			if ( rendererType != type ) {
				rendererType = type;

				if ( inited ) {
					recreateRenderer();
				}
			}
		}
		else {
			return rendererType;
		}
	}

	device.scaleType = function ( type ) {
		if ( type !== undefined ) {
			if ( scaleType != type ) {
				scaleType = type;

				if ( inited ) {
					recreateCanvas();
				}
			}
		}
		else {
			return scaleType;
		}
	}

	return device;
}

/*
	ScreenPage interface:

	properties:
		layer: 0 or 1. Represents screen5 and screen7 respectively.
		flashInvertion: bool. Points whether flash regions must be inverted in current moment.
		semicolors: bool. Points whether semicolors is used.

	methods:
		void bindRenderer( renderer )
			Assigns the renderer that will be user for displaying screen data.

		void unbindRenderer()

		void write( ushort address, byte data )
			Writes byte in the video memory if it's differs from the current value. Queues corresponding area to be redrawed.

		void invalidate()
			Queues all the screen area to be redrawed.

		void flush()
			Flushes invalidated areas to the renderer.

*/
function ScreenPage() {
	this._buffer = [];
	this._dirty = [];
	this._renderer = null;
	this._lastFlashInvertion = false;

	this.layer = 0;
	this.flashInvertion = false;
	this.semicolors = false;

	for ( var address = 0; address < 0x1b00; address++ ) {
		this._buffer[address] = 0;
	}

	for ( var address = 0; address < 0x1800; address++ ) {
		this._dirty[address] = false;
	}

	this.bindRenderer = function ( renderer ) {
		this._renderer = renderer;
	}

	this.unbindRenderer = function () {
		this._renderer = null;
	}

	this.write = function ( address, data ) {
		if ( this._buffer[address] != data ) {
			this._buffer[address] = data;

			if ( address < 0x1800 ) {
				this._dirty[address] = true;
			}
			else {
				var region = ScreenUtils.getRegionCoordsByAddress(address);
				var addresses = ScreenUtils.getAddressesByRegionCoords(region);

				for ( var i = 0; i < 8; i++ ) {
					this._dirty[addresses[i]] = true;
				}
			}
		}
	}

	this.invalidate = function () {
		for ( var address = 0; address < 0x1800; address++ ) {
			this._dirty[address] = true;
		}
	}

	this.flush = function () {
		if ( !this._renderer ) {
			return;
		}

		this._checkForInvertion();

		for ( var address = 0; address < 0x1800; address++ ) {
			if ( this._dirty[address] ) {
				var point = ScreenUtils.getPointCoordsByAddress(address);
				var region = ScreenUtils.getRegionCoordsByPointCoords(point);
				var regionAddress = ScreenUtils.getAddressByRegionCoords(region);

				this._renderer.queueDrawing(
					point.x, // ( 0..31 ) * 8
					point.y, // 0..191
					this.layer, // 0..1
					this._buffer[address], // 8 bits
					this._correctAttrs(this._buffer[regionAddress])); // 7 bits

				this._dirty[address] = false;
			}
		}
	}

	this._checkForInvertion = function () {
		if ( this._lastFlashInvertion != this.flashInvertion ) {
			for ( var address = 0x1800; address < 0x1b00; address++ ) {
				if ( this._buffer[address] & 0x80 ) {
					var region = ScreenUtils.getRegionCoordsByAddress(address);
					var addresses = ScreenUtils.getAddressesByRegionCoords(region);

					for ( var i = 0; i < 8; i++ ) {
						this._dirty[addresses[i]] = true;
					}
				}
			}

			this._lastFlashInvertion = this.flashInvertion;
		}
	}

	this._correctAttrs = function ( attrs ) {
		if ( attrs & 0x80 ) {
			attrs =
				this.flashInvertion ?
				(( attrs & 0x07 ) << 3 ) | (( attrs & 0x38 ) >> 3 ) | ( attrs & 0x40 ) :
				( attrs & 0x7f );

		}

		if ( !this.semicolors ) {
			attrs |= 0x40;
		}

		return attrs;
	}	
}


/*
	Renderer interface:

	methods:
		void createCanvas( HTMLElement container, byte borderWidth, byte scale, enum scaleType )
			Creates the new canvas (or few canvases) and appends it into the container. That method must be called first.

		void destroyCanvas()
			Destroys canvas and removes it from the container.

		void setVisibleLayer( byte layer )
			Sets corresponding layer to be visible.

		byte getVisibleLayer()
			Gets visible layer index.

		void queueDrawing( byte x, byte y, byte layer, byte bits, byte attrs )
			Queues the sprite to be rendered while next the queue procesing.

		void processQueue()
			Renders all the sprites in the queue.

		void drawBorder( vec4 color )
			Fills the border with the specific color.

		void drawBorderText( string text, vec4 color )
			Draws the text on the top border area with the specific color.
*/

function PutImageDataRenderer() {
	this._samples = [];
	this._scale = 1;
	this._scaleType = ScreenConstants.SCALE_TYPE_UNDEFINED;
	this._borderWidth = 16;
	this._lastBorderColor = [ 0, 0, 0, 255 ];
	this._lastBorderTextWidth = 0;

	this._border = null;
	this._layer0 = null;
	this._layer1 = null;

	this._visibleLayer = 0;

	this._ctxBorder = null;
	this._ctxLayer0 = null;
	this._ctxLayer1 = null;

	this._queue = [];

	this._initSamples = function () {
		this._samples = [];

		var sampleCanvas = document.createElement('canvas');
		var sampleContext = sampleCanvas.getContext('2d');
		var scale = ( this._scaleType == ScreenConstants.SCALE_TYPE_PRE ) ?	this._scale : 1;
		var 
			sampleWidth = 8 * scale,
			sampleHeight = 1 * scale;

		/* very very slow in IE */

		for ( var attrs = 0; attrs < 0x80; attrs++ ) {
			var foreground = ScreenUtils.getForegroundColorByAttrs(attrs);
			var background = ScreenUtils.getBackgroundColorByAttrs(attrs);

			for ( var bits = 0; bits < 0x100; bits++ ) {
				var sample = sampleContext.createImageData(sampleWidth, sampleHeight);
				var dataIndex = 0;

				for ( var y = 0; y < scale; y++ ) {
					for ( var bit = 0; bit < 8; bit++ ) {
						var color = ( bits & ( 0x80 >> bit )) ? foreground : background;

						for ( var x = 0; x < scale; x++ ) {
							sample.data[dataIndex++] = color[0];
							sample.data[dataIndex++] = color[1];
							sample.data[dataIndex++] = color[2];
							sample.data[dataIndex++] = color[3];
						}
					}					
				}

				this._samples[( attrs << 8 ) | bits] = sample;
			}
		}
	}

	this._createCanvas = function ( offsetX, offsetY, width, height, pixelScale, cssScale ) {
		var canvas = document.createElement('canvas');
		canvas.width = width * pixelScale;
		canvas.height = height * pixelScale;
		canvas.style.position = 'absolute';
		canvas.style.left = offsetX * pixelScale * cssScale + 'px';
		canvas.style.top = offsetY * pixelScale * cssScale + 'px';
		canvas.style.width = width * pixelScale * cssScale + 'px';
		canvas.style.height = height * pixelScale * cssScale + 'px';
		return canvas;
	}

	this._initImageData = function ( canvasContext, width, height ) {
		var imageData = canvasContext.createImageData( width, height );
		canvasContext.putImageData(imageData, 0, 0);
	}


	this.createCanvas = function ( container, borderWidth, scale, scaleType ) {
		// с методом putImageData масштабирование при отрисовке невозможно
		if ( scaleType == ScreenConstants.SCALE_TYPE_RENDER ) {
			scaleType = ScreenConstants.SCALE_TYPE_PRE;
		}

		if (( scale != this._scale ) || ( scaleType != this._scaleType )) {
			this._scale = scale;
			this._scaleType = scaleType;
			this._initSamples();
		}

		this._borderWidth = borderWidth;

		var pixelScale = ( this._scaleType == ScreenConstants.SCALE_TYPE_PRE ) ? this._scale : 1;
		var cssScale = ( this._scaleType == ScreenConstants.SCALE_TYPE_POST ) ? this._scale : 1;

		this._border = this._createCanvas(0, 0, borderWidth + 256 + borderWidth, borderWidth + 192 + borderWidth, scale, 1);
		this._ctxBorder = this._border.getContext('2d');
		this._initImageData( this._ctxBorder, this._border.width, this._border.height );
		container.appendChild(this._border);

		this._layer0 = this._createCanvas(borderWidth, borderWidth, 256, 192, pixelScale, cssScale);
		this._ctxLayer0 = this._layer0.getContext('2d');
		this._initImageData( this._ctxLayer0, this._layer0.width, this._layer0.height );
		container.appendChild(this._layer0);

		this._layer1 = this._createCanvas(borderWidth, borderWidth, 256, 192, pixelScale, cssScale);
		this._ctxLayer1 = this._layer1.getContext('2d');
		this._initImageData( this._ctxLayer1, this._layer1.width, this._layer1.height );
		container.appendChild(this._layer1);

		this.setVisibleLayer(this._visibleLayer);
	}

	this.destroyCanvas = function() {
		if ( this._border ) {
			if ( this._border.parentNode ) {
				this._border.parentNode.removeChild(this._border);
			}
			this._border = null;
			this._ctxBorder = null;
		}

		if ( this._layer0 ) {
			if ( this._layer0.parentNode ) {
				this._layer0.parentNode.removeChild(this._layer0);
			}
			this._layer0 = null;
			this._ctxLayer0 = null;
		}

		if ( this._layer1 ) {
			if ( this._layer1.parentNode ) {
				this._layer1.parentNode.removeChild(this._layer1);
			}
			this._layer1 = null;
			this._ctxLayer1 = null;
		}
	}

	this.setVisibleLayer = function ( layer ) {
		this._visibleLayer = layer;
		if ( this._layer1 ) {
			this._layer1.style.opacity = ( layer != 0 ) ? 1 : 0;
		}
	}

	this.getVisibleLayer = function () {
		return this._visibleLayer;
	}

	this.queueDrawing = function ( x, y, layer, bits, attrs ) { 
		this._queue.push(x, y, layer, ( attrs << 8 ) | bits);
	}

	this.processQueue = function () {
		var sampleScale = ( this._scaleType == ScreenConstants.SCALE_TYPE_PRE ) ? this._scale : 1;
		var queueLength = this._queue.length;
		for ( var i = 0; i < queueLength; ) {
			var 
				dx = this._queue[i++] * sampleScale, 
				dy = this._queue[i++] * sampleScale, 
				layer = this._queue[i++],
				sampleIndex = this._queue[i++];

			if ( layer == 0 ) {
				if ( this._ctxLayer0 ) {
					this._ctxLayer0.putImageData(this._samples[sampleIndex], dx, dy);
				}
			}
			else {
				if ( this._ctxLayer1 ) {
					this._ctxLayer1.putImageData(this._samples[sampleIndex], dx, dy);
				}
			}
		}
		this._queue = [];
	}

	this.drawBorder = function( color ) { 
		if ( !this._ctxBorder ) {
			return;
		}

		var 
			scale = this._scale,
			ctx = this._ctxBorder,
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
	}

	this.drawBorderText = function( text, color ) { 
		if ( !this._ctxBorder ) {
			return;
		}

		var
			scale = this._scale,
			ctx = this._ctxBorder,
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
	}
}

function DrawImageRenderer() {
	this._scale = 1;
	this._scaleType = ScreenConstants.SCALE_TYPE_UNDEFINED;
	this._borderWidth = 16;
	this._lastBorderColor = [ 0, 0, 0, 255 ];
	this._lastBorderTextWidth = 0;

	this._samples = null;
	this._sampleParams = {
		width: 8,
		height: 1,
		stepX: 10,
		stepY: 3
	};

	this._border = null;
	this._layer0 = null;
	this._layer1 = null;

	this._visibleLayer = 0;

	this._ctxBorder = null;
	this._ctxLayer0 = null;
	this._ctxLayer1 = null;

	this._queue = [];

	this._initSamples = function () {
		/*
			All browsers except the Google Chrome are calculate pixel color basing on the neighbor pixels
			so we need to dublicate boundary pixels for the correct colors.

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
		var sampleScale = ( this._scaleType == ScreenConstants.SCALE_TYPE_PRE ) ? this._scale : 1;
		var sampleParams = {
			width: 8 * sampleScale,
			height: 1 * sampleScale,
			stepX: 8 * sampleScale + 2, // 8 точек сэмпла и 2 обрамляющих точки
			stepY: 1 * sampleScale + 2 // 1 точка сэмпла и 2 обрамляющих точки
		}

		var samples = document.createElement('canvas');
		samples.width = 0x100 * sampleParams.stepX; 
		samples.height = 0x80 * sampleParams.stepY; 

		var samplesContext = samples.getContext('2d');
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
			var foreground = ScreenUtils.getForegroundColorByAttrs(state.attrs);
			var background = ScreenUtils.getBackgroundColorByAttrs(state.attrs);

			for ( var pixels = 0; pixels < 0x100; pixels++ ) {
				for ( var pixel = 0; pixel < 8; pixel++ ) {
					var color = ( pixels & ( 0x80 >> pixel )) ? foreground : background;

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
	}

	this._createCanvas = function ( offsetX, offsetY, width, height, pixelScale, cssScale ) {
		var canvas = document.createElement('canvas');
		canvas.width = width * pixelScale;
		canvas.height = height * pixelScale;
		canvas.style.position = 'absolute';
		canvas.style.left = offsetX * pixelScale * cssScale + 'px';
		canvas.style.top = offsetY * pixelScale * cssScale + 'px';
		canvas.style.width = width * pixelScale * cssScale + 'px';
		canvas.style.height = height * pixelScale * cssScale + 'px';
		return canvas;
	}

	this._initImageData = function ( canvasContext, width, height ) {
		var imageData = canvasContext.createImageData( width, height );
		canvasContext.putImageData(imageData, 0, 0);
	}


	this.createCanvas = function ( container, borderWidth, scale, scaleType ) {
		if (( this._scale != scale ) || ( this._scaleType != scaleType )) {
			this._scale = scale;
			this._scaleType = scaleType;
			this._initSamples();	
		}
		
		this._borderWidth = borderWidth;

		var pixelScale = ( this._scaleType == ScreenConstants.SCALE_TYPE_PRE || this._scaleType == ScreenConstants.SCALE_TYPE_RENDER ) ? this._scale : 1;
		var cssScale = ( this._scaleType == ScreenConstants.SCALE_TYPE_POST ) ? this._scale : 1;

		this._border = this._createCanvas(0, 0, borderWidth + 256 + borderWidth, borderWidth + 192 + borderWidth, scale, 1);
		this._ctxBorder = this._border.getContext('2d');
		this._initImageData( this._ctxBorder, this._border.width, this._border.height );
		container.appendChild(this._border);

		this._layer0 = this._createCanvas(borderWidth, borderWidth, 256, 192, pixelScale, cssScale);
		this._ctxLayer0 = this._layer0.getContext('2d');
		this._initImageData( this._ctxLayer0, this._layer0.width, this._layer0.height );
		container.appendChild(this._layer0);

		this._layer1 = this._createCanvas(borderWidth, borderWidth, 256, 192, pixelScale, cssScale);
		this._ctxLayer1 = this._layer1.getContext('2d');
		this._initImageData( this._ctxLayer1, this._layer1.width, this._layer1.height );
		container.appendChild(this._layer1);

		this.setVisibleLayer(this._visibleLayer);
	}

	this.destroyCanvas = function() {
		if ( this._border ) {
			if ( this._border.parentNode ) {
				this._border.parentNode.removeChild(this._border);
			}
			this._border = null;
			this._ctxBorder = null;
		}

		if ( this._layer0 ) {
			if ( this._layer0.parentNode ) {
				this._layer0.parentNode.removeChild(this._layer0);
			}
			this._layer0 = null;
			this._ctxLayer0 = null;
		}

		if ( this._layer1 ) {
			if ( this._layer1.parentNode ) {
				this._layer1.parentNode.removeChild(this._layer1);
			}
			this._layer1 = null;
			this._ctxLayer1 = null;
		}
	}

	this.setVisibleLayer = function ( layer ) {
		this._visibleLayer = layer;
		if ( this._layer1 ) {
			this._layer1.style.opacity = ( layer != 0 ) ? 1 : 0;
		}
	}

	this.getVisibleLayer = function () {
		return this._visibleLayer;
	}

	this.queueDrawing = function ( x, y, layer, bits, attrs ) { 
		this._queue.push(x, y, layer, bits, attrs);
	}

	this.processQueue = function () {
		var 
			renderScale = ( this._scaleType == ScreenConstants.SCALE_TYPE_PRE || this._scaleType == ScreenConstants.SCALE_TYPE_RENDER ) ? this._scale : 1,
			queueLength = this._queue.length,
			sampleParams = this._sampleParams,
			w = 8 * renderScale,
			h = 1 * renderScale;

		for ( var i = 0; i < queueLength; ) {
			var 
				x = this._queue[i++] * renderScale, 
				y = this._queue[i++] * renderScale, 
				layer = this._queue[i++],
				sx = this._queue[i++] * sampleParams.stepX + 1,
				sy = this._queue[i++] * sampleParams.stepY + 1;

			if ( layer == 0 ) {
				if ( this._ctxLayer0 ) {
					this._ctxLayer0.drawImage(this._samples, sx, sy, sampleParams.width, sampleParams.height, x, y, w, h);
				}
			}
			else {
				if ( this._ctxLayer1 ) {
					this._ctxLayer1.drawImage(this._samples, sx, sy, sampleParams.width, sampleParams.height, x, y, w, h);
				}
			}
		}
		this._queue = [];
	}

	this.drawBorder = function( color ) { 
		if ( !this._ctxBorder ) {
			return;
		}

		var 
			scale = this._scale,
			ctx = this._ctxBorder,
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
	}

	this.drawBorderText = function( text, color ) { 
		if ( !this._ctxBorder ) {
			return;
		}

		var
			scale = this._scale,
			ctx = this._ctxBorder,
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
	}
}

function WebGLRenderer() {
	this._scale = 1;
	this._scaleType = ScreenConstants.SCALE_TYPE_UNDEFINED;
	this._borderWidth = 16;
	this._lastBorderColor = [ 0, 0, 0, 255 ];
	this._lastBorderTextWidth = 0;

	this._samples = null;
	this._sampleParams = {
		width: 8,
		height: 1
	};

	this._border = null;
	this._layer0 = null;
	this._layer1 = null;

	this._visibleLayer = 0;

	this._ctxBorder = null;
	this._ctxLayer0 = null;
	this._ctxLayer1 = null;

	this._queue = [];

	this._initSamples = function () {
		/*
			x       x       x       x
			0       8       16      24

		y0	sample00sample01sample02...
		y1	sample10sample11sample12...
		y2	...........................

		*/
		var sampleScale = ( this._scaleType == ScreenConstants.SCALE_TYPE_PRE ) ? this._scale : 1;
		var sampleParams = {
			width: 8 * sampleScale,
			height: 1 * sampleScale
		}

		var samples = document.createElement('canvas');
		samples.width = 0x100 * sampleParams.width; 
		samples.height = 0x80 * sampleParams.height; 

		var samplesContext = samples.getContext('2d');
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
			var foreground = ScreenUtils.getForegroundColorByAttrs(state.attrs);
			var background = ScreenUtils.getBackgroundColorByAttrs(state.attrs);

			for ( var pixels = 0; pixels < 0x100; pixels++ ) {
				for ( var pixel = 0; pixel < 8; pixel++ ) {
					var color = ( pixels & ( 0x80 >> pixel )) ? foreground : background;

					for ( var i = 0; i < sampleScale; i++ ) {
						state.data[state.dataIndex++] = color[0];
						state.data[state.dataIndex++] = color[1];
						state.data[state.dataIndex++] = color[2];
						state.data[state.dataIndex++] = color[3];
					}
				}
			}
		}
	}

	this._createCanvas = function ( offsetX, offsetY, width, height, pixelScale, cssScale ) {
		var canvas = document.createElement('canvas');
		canvas.width = width * pixelScale;
		canvas.height = height * pixelScale;
		canvas.style.position = 'absolute';
		canvas.style.left = offsetX * pixelScale * cssScale + 'px';
		canvas.style.top = offsetY * pixelScale * cssScale + 'px';
		canvas.style.width = width * pixelScale * cssScale + 'px';
		canvas.style.height = height * pixelScale * cssScale + 'px';
		return canvas;
	}

	this._initImageData = function ( canvasContext, width, height ) {
		var imageData = canvasContext.createImageData( width, height );
		canvasContext.putImageData(imageData, 0, 0);
	}

	this._vertexShaderSource = [
		"attribute vec4 a_params;",
		"attribute vec2 a_canvasResolution;",
		"attribute vec2 a_samplesResolution;",
		"varying vec2 v_sampleCoords;",

		"void main() {",
		"	vec2 clipCoords = (( a_params.xy / a_canvasResolution ) * 2.0 - 1.0) * vec2(1.0, -1.0);",
		"	gl_Position = vec4(clipCoords, 0.0, 1.0);",
		"	v_sampleCoords = a_params.pq / a_samplesResolution;",
		"}"
	].join('\r\n');

	this._fragmentShaderSource = [
		"#ifdef GL_ES",
	    "precision mediump float;",
	    "#endif",
        "uniform sampler2D u_samples;",
        "varying vec2 v_sampleCoords;",
	    
	    "void main() {",
	    "	gl_FragColor = texture2D(u_samples, v_sampleCoords);",
	    "}"
	].join('\r\n');

	this._initWebGLContext = function ( glContext ) {
		var vertexShader = WebGLUtils.createShader(glContext, glContext.VERTEX_SHADER, this._vertexShaderSource);
		var fragmentShader = WebGLUtils.createShader(glContext, glContext.FRAGMENT_SHADER, this._fragmentShaderSource);
		var program = WebGLUtils.createAndLinkProgram(glContext, [vertexShader, fragmentShader]);
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
	}

	this.createCanvas = function ( container, borderWidth, scale, scaleType ) {
		if (( this._scale != scale ) || ( this._scaleType != scaleType )) {
			this._scale = scale;
			this._scaleType = scaleType;
			this._initSamples();	
		}
		
		this._borderWidth = borderWidth;

		var pixelScale = ( this._scaleType == ScreenConstants.SCALE_TYPE_PRE || this._scaleType == ScreenConstants.SCALE_TYPE_RENDER ) ? this._scale : 1;
		var cssScale = ( this._scaleType == ScreenConstants.SCALE_TYPE_POST ) ? this._scale : 1;

		this._border = this._createCanvas(0, 0, borderWidth + 256 + borderWidth, borderWidth + 192 + borderWidth, scale, 1);
		this._ctxBorder = this._border.getContext('2d');
		this._initImageData( this._ctxBorder, this._border.width, this._border.height );
		container.appendChild(this._border);

		// extra points to width for correct for with FF
		var 
			layerWidth = 256 + ( navigator.userAgent.indexOf('Firefox') >= 0 ? 1 : 0 ),
			layerHeight = 192;

		this._layer0 = this._createCanvas(borderWidth, borderWidth, layerWidth, layerHeight, pixelScale, cssScale);
		this._layer1 = this._createCanvas(borderWidth, borderWidth, layerWidth, layerHeight, pixelScale, cssScale);

		this._ctxLayer0 = WebGLUtils.getWebGLContext(this._layer0, { preserveDrawingBuffer: true });
		this._ctxLayer1 = WebGLUtils.getWebGLContext(this._layer1, { preserveDrawingBuffer: true });

		if ( !this._ctxLayer0 || !this._ctxLayer1 ) {
			throw new Error('Не удается создать холст. Вы можете попробовать выбрать другой метод отрисовки.');
		}

		this._initWebGLContext(this._ctxLayer0);
		this._initWebGLContext(this._ctxLayer1);

		container.appendChild(this._layer0);
		container.appendChild(this._layer1);

		this.setVisibleLayer(this._visibleLayer);
	}

	this.destroyCanvas = function() {
		if ( this._border ) {
			if ( this._border.parentNode ) {
				this._border.parentNode.removeChild(this._border);
			}
			this._border = null;
			this._ctxBorder = null;
		}

		if ( this._layer0 ) {
			if ( this._layer0.parentNode ) {
				this._layer0.parentNode.removeChild(this._layer0);
			}
			this._layer0 = null;
			this._ctxLayer0 = null;
		}

		if ( this._layer1 ) {
			if ( this._layer1.parentNode ) {
				this._layer1.parentNode.removeChild(this._layer1);
			}
			this._layer1 = null;
			this._ctxLayer1 = null;
		}
	}

	this.setVisibleLayer = function ( layer ) {
		this._visibleLayer = layer;
		if ( this._layer1 ) {
			this._layer1.style.opacity = ( layer != 0 ) ? 1 : 0;
		}
	}

	this.getVisibleLayer = function () {
		return this._visibleLayer;
	}

	this.queueDrawing = function ( x, y, layer, bits, attrs ) { 
		this._queue.push(x, y, layer, bits, attrs);
	}

	this.processQueue = function () {
		var 
			//sampleScale = ( this._scaleType == ScreenConstants.SCALE_TYPE_PRE ) ? this._scale : 1,
			renderScale = ( this._scaleType == ScreenConstants.SCALE_TYPE_PRE || this._scaleType == ScreenConstants.SCALE_TYPE_RENDER ) ? this._scale : 1,
			queueLength = this._queue.length,
			sampleParams = this._sampleParams,
			dw = 8 * renderScale,
			dh = 1 * renderScale,
			params0 = [],
			params1 = [];

		for ( var i = 0; i < queueLength; ) {
			var 
				dl = this._queue[i++] * renderScale,
				dr = dl + dw,
				dt = this._queue[i++] * renderScale,
				db = dt + dh,
				layer = this._queue[i++],
				sl = this._queue[i++] * sampleParams.width,
				sr = sl + sampleParams.width,
				st = this._queue[i++] * sampleParams.height,
				sb = st + sampleParams.height;

			if ( layer == 0 ) {
				params0.push(
					dl, dt, sl, st,
					dr, dt, sr, st,
					dr, db, sr, sb,
					dl, dt, sl, st,
					dl, db, sl, sb,
					dr, db, sr, sb);
			}
			else {
				params1.push(
					dl, dt, sl, st,
					dr, dt, sr, st,
					dr, db, sr, sb,
					dl, dt, sl, st,
					dl, db, sl, sb,
					dr, db, sr, sb);
			}
		}

		if ( params0.length && this._ctxLayer0 ) {
			var gl = this._ctxLayer0;
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(params0), gl.STATIC_DRAW);
			gl.drawArrays(gl.TRIANGLES, 0, params0.length >> 2); // === ( params0.length / 4 )
		}

		if ( params1.length && this._ctxLayer1 ) {
			var gl = this._ctxLayer1;
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(params1), gl.STATIC_DRAW);
			gl.drawArrays(gl.TRIANGLES, 0, params1.length >> 2); // === ( params1.length / 4 )
		}

		this._queue = [];
	}

	this.drawBorder = function( color ) { 
		if ( !this._ctxBorder ) {
			return;
		}

		var 
			scale = this._scale,
			ctx = this._ctxBorder,
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
	}

	this.drawBorderText = function( text, color ) { 
		if ( !this._ctxBorder ) {
			return;
		}

		var
			scale = this._scale,
			ctx = this._ctxBorder,
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
	}
}