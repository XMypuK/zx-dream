function ZX_Settings() {
	this._container = Object.assign({}, ZX_Settings.defaultValues);
}
Object.assign(ZX_Settings.prototype, {
	// Включение/выключение полутонов (бит яркости)
	get_semicolors: function() {
		return this._container.semicolors;
	},
	set_semicolors: function(value) {
		this._container.semicolors = value;
	},
	// Выбор метода отрисовки изображения: putImageData, drawImage, WebGL.
	get_rendererType: function() {
		return this._container.rendererType;
	},
	set_rendererType: function(value) {
		this._container.rendererType = value;
	},
	// Выбор метода масштабирования.
	// - Предварительное: подгатавливаются сэмплы необходимых размеров заранее.
	// - При отрисовке: сэмплы масштабируются во время копирования на экран.
	// - Последующее: масштабирование осуществляется средствами CSS.
	get_scaleType: function() {
		return this._container.scaleType;
	},
	set_scaleType: function(value) {
		this._container.scaleType = value;
	},
	// Масштаб
	get_scaleValue: function() {
		return this._container.scaleValue;
	},
	set_scaleValue: function(value) {
		this._container.scaleValue = value;
	},
	// Интервал в тактах процессора, после которого происходит прерывание.
	get_tstatesPerIntrq: function() {
		return this._container.tstatesPerIntrq;
	},
	set_tstatesPerIntrq: function(value) {
		this._container.tstatesPerIntrq = value;
	},
	// Интервал в тактах процессора, после которого происходит прерывание в турбо-режиме.
	get_tstatesPerIntrqTurbo: function() {
		return this._container.tstatesPerIntrqTurbo;
	},
	set_tstatesPerIntrqTurbo: function(value) {
		this._container.tstatesPerIntrqTurbo = value;
	},
	// Турбо-режим
	get_turboMode: function() {
		return this._container.turboMode;
	},
	set_turboMode: function(value) {
		this._container.turboMode = value;
	},
	// Интервал в милисекундах, не ранее которого происходит прерывание.
	get_intrqPeriod: function() {
		return this._container.intrqPeriod;
	},
	set_intrqPeriod: function(value) {
		this._container.intrqPeriod = value;
	},
	// Расширенная память (> 128KB).
	// 0 - выключена
	// 1 - Pentagon (512KB)
	get_extendedMemory: function() {
		return this._container.extendedMemory;
	},
	set_extendedMemory: function(value) {
		this._container.extendedMemory = value;
	},
	// Включить/выключить отрисовку по событию requestAnimationFrame.
	get_renderOnAnimationFrame: function() {
		return this._container.renderOnAnimationFrame;
	},
	set_renderOnAnimationFrame: function(value) {
		this._container.renderOnAnimationFrame = value;
	},
	// Установленные в приводах дискетты
	get_drive: function(index) {
		return this._container['drive' + index];
	},
	set_drive: function(index, value) {
		if (index < 0 || index > 3)
			return;
		this._container['drive' + index] = value;
	},
	// Музыкальный сорпроцессор
	get_psg: function() {
		return this._container.psg;
	},
	set_psg: function(value) {
		this._container.psg = value;
	},
	// Частота музыкального сопроцессора
	get_psgClock: function() {
		return this._container.psgClock;
	},
	set_psgClock: function(value) {
		this._container.psgClock = value;
	},
	// Размер выходного буфера воспроизведения аудио
	get_psgBufferSize: function() {
		return this._container.psgBufferSize;
	},
	set_psgBufferSize: function(value) {
		this._container.psgBufferSize = value;
	},
	reset: function () {
		this.set_tstatesPerIntrq(ZX_Settings.defaultValues.tstatesPerIntrq);
		this.set_tstatesPerIntrqTurbo(ZX_Settings.defaultValues.tstatesPerIntrqTurbo);
		this.set_intrqPeriod(ZX_Settings.defaultValues.intrqPeriod);
		this.set_turboMode(ZX_Settings.defaultValues.turboMode);
		this.set_extendedMemory(ZX_Settings.defaultValues.extendedMemory);
		this.set_semicolors(ZX_Settings.defaultValues.semicolors);
		this.set_rendererType(ZX_Settings.defaultValues.rendererType);
		this.set_scaleType(ZX_Settings.defaultValues.scaleType);
		this.set_scaleValue(ZX_Settings.defaultValues.scaleValue);
		this.set_renderOnAnimationFrame(ZX_Settings.defaultValues.renderOnAnimationFrame);
		this.set_psg(ZX_Settings.defaultValues.psg);
		this.set_psgClock(ZX_Settings.defaultValues.psgClock);
		this.set_psgBufferSize(ZX_Settings.defaultValues.psgBufferSize);
	}
});
ZX_Settings.defaultValues = {
	semicolors: true,
	rendererType: isWebGLSupported() ? VAL_RENDERER_WEB_GL : VAL_RENDERER_DRAW_IMAGE,
	scaleType: VAL_SCALE_METHOD_RENDER,
	scaleValue: 2,
	tstatesPerIntrq: 71680,
	tstatesPerIntrqTurbo: 143360,
	turboMode: true,
	intrqPeriod: 20.48,
	extendedMemory: 1,
	renderOnAnimationFrame: false,
	drive0: 'Deja Vu #A.trd',
	drive1: '',
	drive2: '',
	drive3: '',
	psg: 0,
	psgClock: 1773400,
	psgBufferSize: 0
};

function ZX_StorableSettings() {
	ZX_StorableSettings.superclass.constructor.apply(this, arguments);
	this._defaultMode = /(\?|&)default=?(&|$)/.test(window.location.search);

	if (!this._defaultMode) {
		this._container.semicolors = this.readFromStorage('semicolors');
		this._container.rendererType = this.readFromStorage('rendererType');
		this._container.scaleType = this.readFromStorage('scaleType');
		this._container.scaleValue = this.readFromStorage('scaleValue');
		this._container.tstatesPerIntrq = this.readFromStorage('tstatesPerIntrq');
		this._container.tstatesPerIntrqTurbo = this.readFromStorage('tstatesPerIntrqTurbo');
		this._container.turboMode = this.readFromStorage('turboMode');
		this._container.intrqPeriod = this.readFromStorage('intrqPeriod');
		this._container.extendedMemory = this.readFromStorage('extendedMemory');
		this._container.renderOnAnimationFrame = this.readFromStorage('renderOnAnimationFrame');
		this._container.drive0 = this.readFromStorage('drive0');
		this._container.drive1 = this.readFromStorage('drive1');
		this._container.drive2 = this.readFromStorage('drive2');
		this._container.drive3 = this.readFromStorage('drive3');
		this._container.psg = this.readFromStorage('psg');
		this._container.psgClock = this.readFromStorage('psgClock');
		this._container.psgBufferSize = this.readFromStorage('psgBufferSize');
	};
}
extend(ZX_StorableSettings, ZX_Settings);
Object.assign(ZX_StorableSettings.prototype, {
	readFromStorage: function(name) {
		var defaultValue = ZX_Settings.defaultValues[name];
		if (this._defaultMode || !localStorage)
			return defaultValue;
		var storageValue = localStorage['opt_' + name];
		if (storageValue === undefined)
			return defaultValue;
		switch (typeof defaultValue) {
			case 'number': return +storageValue;
			case 'boolean': return storageValue == 'true';
			default: return storageValue;
		}
	},
	writeToStorage: function(name, value) {
		if (!localStorage)
			return;
		if (value !== undefined) {
			localStorage['opt_' + name] = value;
		}
		else {
			delete localStorage['opt_' + name];
		}
	},
	set_semicolors: function(value) {
		ZX_StorableSettings.superclass.set_semicolors.call(this, value);
		this.writeToStorage('semicolors', value);
	},
	set_rendererType: function(value) {
		ZX_StorableSettings.superclass.set_rendererType.call(this, value);
		this.writeToStorage('rendererType', value);
	},
	set_scaleType: function(value) {
		ZX_StorableSettings.superclass.set_scaleType.call(this, value);
		this.writeToStorage('scaleType', value);
	},
	set_scaleValue: function(value) {
		ZX_StorableSettings.superclass.set_scaleValue.call(this, value);
		this.writeToStorage('scaleValue', value);
	},
	set_tstatesPerIntrq: function(value) {
		ZX_StorableSettings.superclass.set_tstatesPerIntrq.call(this, value);
		this.writeToStorage('tstatesPerIntrq', value);
	},
	set_tstatesPerIntrqTurbo: function(value) {
		ZX_StorableSettings.superclass.set_tstatesPerIntrqTurbo.call(this, value);
		this.writeToStorage('tstatesPerIntrqTurbo', value);
	},
	set_turboMode: function(value) {
		ZX_StorableSettings.superclass.set_turboMode.call(this, value);
		this.writeToStorage('turboMode', value);
	},
	set_intrqPeriod: function(value) {
		ZX_StorableSettings.superclass.set_intrqPeriod.call(this, value);
		this.writeToStorage('intrqPeriod', value);
	},
	set_extendedMemory: function(value) {
		ZX_StorableSettings.superclass.set_extendedMemory.call(this, value);
		this.writeToStorage('extendedMemory', value);
	},
	set_renderOnAnimationFrame: function(value) {
		ZX_StorableSettings.superclass.set_renderOnAnimationFrame.call(this, value);
		this.writeToStorage('renderOnAnimationFrame', value);
	},
	set_drive: function(index, value) {
		ZX_StorableSettings.superclass.set_drive.call(this, index, value);
		if (index < 0 || index > 3)
			return;
			this.writeToStorage('drive' + index, value);
	},
	set_psg: function(value) {
		ZX_StorableSettings.superclass.set_psg.call(this, value);
		this.writeToStorage('psg', value);
	},
	set_psgClock: function(value) {
		ZX_StorableSettings.superclass.set_psgClock.call(this, value);
		this.writeToStorage('psgClock', value);
	},
	set_psgBufferSize: function(value) {
		ZX_StorableSettings.superclass.set_psgBufferSize.call(this, value);
		this.writeToStorage('psgBufferSize', value);
	}
});