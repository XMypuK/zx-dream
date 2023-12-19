function ZX_Settings() {
	var defaultMode = /(\?|&)default=?(&|$)/.test(window.location.search);
	var defaultValues = {
		semicolors: true,
		rendererType: isWebGLSupported() ? VAL_RENDERER_WEB_GL : VAL_RENDERER_DRAW_IMAGE,
		scaleType: VAL_SCALE_METHOD_RENDER,
		scaleValue: 2,
		tstatesPerIntrq: 71680,
		tstatesPerIntrqTurbo: 143360,
		turboMode: true,
		intrqPeriod: 20.48,
		extendedMemory: 1,
		useTypedArrays: isTypedArraysSupported(),
		renderOnAnimationFrame: false,
		drive0: 'Deja Vu #A.trd',
		drive1: '',
		drive2: '',
		drive3: '',
		psg: 0,
		psgClock: 1773400,
		psgBufferSize: 0
};
	var values = {
		semicolors: readFromStorage('semicolors'),
		rendererType: readFromStorage('rendererType'),
		scaleType: readFromStorage('scaleType'),
		scaleValue: readFromStorage('scaleValue'),
		tstatesPerIntrq: readFromStorage('tstatesPerIntrq'),
		tstatesPerIntrqTurbo: readFromStorage('tstatesPerIntrqTurbo'),
		turboMode: readFromStorage('turboMode'),
		intrqPeriod: readFromStorage('intrqPeriod'),
		extendedMemory: readFromStorage('extendedMemory'),
		useTypedArrays: readFromStorage('useTypedArrays'),
		renderOnAnimationFrame: readFromStorage('renderOnAnimationFrame'),
		drive0: readFromStorage('drive0'),
		drive1: readFromStorage('drive1'),
		drive2: readFromStorage('drive2'),
		drive3: readFromStorage('drive3'),
		psg: readFromStorage('psg'),
		psgClock: readFromStorage('psgClock'),
		psgBufferSize: readFromStorage('psgBufferSize')
	};

	function readFromStorage(name) {
		var defaultValue = defaultValues[name];;
		if (defaultMode || !localStorage)
			return defaultValue;
		var storageValue = localStorage['opt_' + name];
		if (storageValue === undefined)
			return defaultValue;
		switch (typeof defaultValue) {
			case 'number': return +storageValue;
			case 'boolean': return storageValue == 'true';
			default: return storageValue;
		}
	}

	function writeToStorage(name, value) {
		if (!localStorage)
			return;
		if (value !== undefined) {
			localStorage['opt_' + name] = value;
		}
		else {
			delete localStorage['opt_' + name];
		}
	}

	this.reset = function () {
		this.set_tstatesPerIntrq(defaultValues.tstatesPerIntrq);
		this.set_tstatesPerIntrqTurbo(defaultSettings.tstatesPerIntrqTurbo);
		this.set_intrqPeriod(defaultSettings.intrqPeriod);
		this.set_turboMode(defaultSettings.turboMode);
		this.set_extendedMemory(defaultSettings.extendedMemory);
		this.set_semicolors(defaultSettings.semicolors);
		this.set_rendererType(defaultSettings.rendererType);
		this.set_scaleType(defaultSettings.scaleType);
		this.set_scaleValue(defaultSettings.scaleValue);
		this.set_renderOnAnimationFrame(defaultSettings.renderOnAnimationFrame);
		this.set_useTypedArrays(defaultSettings.useTypedArrays);
		this.set_psg(defaultSettings.psg);
		this.set_psgClock(defaultSettings.psgClock);
		this.set_psgBufferSize(defaultSettings.psgBufferSize);
	}
	
	this.get_defaultValues = function() {
		return $.extend({}, defaultValues);
	}
	
	// Включение/выключение полутонов (бит яркости)
	this.get_semicolors = function() {
		return values.semicolors;
	}
	this.set_semicolors = function(value) {
		values.semicolors = value;
		writeToStorage('semicolors', value);
	}
	// Выбор метода отрисовки изображения: putImageData, drawImage, WebGL.
	this.get_rendererType = function() {
		return values.rendererType;
	}
	this.set_rendererType = function(value) {
		values.rendererType = value;
		writeToStorage('rendererType', value);
	}
	// Выбор метода масштабирования.
	// - Предварительное: подгатавливаются сэмплы необходимых размеров заранее.
	// - При отрисовке: сэмплы масштабируются во время копирования на экран.
	// - Последующее: масштабирование осуществляется средствами CSS.
	this.get_scaleType = function() {
		return values.scaleType;
	} 
	this.set_scaleType = function(value) {
		values.scaleType = value;
		writeToStorage('scaleType', value);
	}
	// Масштаб
	this.get_scaleValue = function() {
		return values.scaleValue;
	}
	this.set_scaleValue = function(value) {
		values.scaleValue = value;
		writeToStorage('scaleValue', value);
	}
	// Интервал в тактах процессора, после которого происходит прерывание.
	this.get_tstatesPerIntrq = function() {
		return values.tstatesPerIntrq;
	}
	this.set_tstatesPerIntrq = function(value) {
		values.tstatesPerIntrq = value;
		writeToStorage('tstatesPerIntrq', value);
	}
	// Интервал в тактах процессора, после которого происходит прерывание в турбо-режиме.
	this.get_tstatesPerIntrqTurbo = function() {
		return values.tstatesPerIntrqTurbo;
	}
	this.set_tstatesPerIntrqTurbo = function(value) {
		values.tstatesPerIntrqTurbo = value;
		writeToStorage('tstatesPerIntrqTurbo', value);
	}
	// Турбо-режим
	this.get_turboMode = function() {
		return values.turboMode;
	}
	this.set_turboMode = function(value) {
		values.turboMode = value;
		writeToStorage('turboMode', value);
	}
	// Интервал в милисекундах, не ранее которого происходит прерывание.
	this.get_intrqPeriod = function() {
		return values.intrqPeriod;
	}
	this.set_intrqPeriod = function(value) {
		values.intrqPeriod = value;
		writeToStorage('intrqPeriod', value);
	}
	// Расширенная память (> 128KB).
	// 0 - выключена
	// 1 - Pentagon (512KB)
	this.get_extendedMemory = function() {
		return values.extendedMemory;
	}
	this.set_extendedMemory = function(value) {
		values.extendedMemory = value;
		writeToStorage('extendedMemory', value);
	}
	// Включить/выключить использование типизированных массивов для эмуляции памяти и дисплея.
	this.get_useTypedArrays = function() {
		return values.useTypedArrays;
	}
	this.set_useTypedArrays = function(value) {
		values.useTypedArrays = value;
		writeToStorage('useTypedArrays', value);
	}
	// Включить/выключить отрисовку по событию requestAnimationFrame.
	this.get_renderOnAnimationFrame = function() {
		return values.renderOnAnimationFrame;
	}
	this.set_renderOnAnimationFrame = function(value) {
		values.renderOnAnimationFrame = value;
		writeToStorage('renderOnAnimationFrame', value);
	}
	// Установленные в приводах дискетты
	this.get_drive = function(index) {
		return values['drive' + index];
	} 
	this.set_drive = function(index, value) {
		if (index < 0 || index > 3)
			return;
		values['drive' + index] = value;
		writeToStorage('drive' + index, value);
	}
	// Музыкальный сорпроцессор
	this.get_psg = function() {
		return values.psg;
	}
	this.set_psg = function(value) {
		values.psg = value;
		writeToStorage('psg', value);
	}
	// Частота музыкального сопроцессора
	this.get_psgClock = function() {
		return values.psgClock;
	}
	this.set_psgClock = function(value) {
		values.psgClock = value;
		writeToStorage('psgClock', value);
	}
	// Размер выходного буфера воспроизведения аудио
	this.get_psgBufferSize = function() {
		return values.psgBufferSize;
	}
	this.set_psgBufferSize = function(value) {
		values.psgBufferSize = value;
		writeToStorage('psgBufferSize', value);
	}
}