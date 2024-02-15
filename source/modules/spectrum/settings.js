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
	// бипер
	get_beeper: function () {
		return this._container.beeper;
	},
	set_beeper: function (value) {
		this._container.beeper = value;
	},
	// Громкость бипера
	get_beeperVolume: function () {
		return this._container.beeperVolume;
	},
	set_beeperVolume: function (value) {
		this._container.beeperVolume = value;
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
	// Размер пакета сэмплов, передающихся в выходной буфер за раз
	get_psgPacketSize: function () {
		return this._container.psgPacketSize;
	},
	set_psgPacketSize: function (value) {
		this._container.psgPacketSize = value;
	},
	// Turbo Sound
	get_psgTurboSound: function () {
		return this._container.psgTurboSound;
	},
	set_psgTurboSound: function (value) {
		this._container.psgTurboSound = value;
	},
	// Распределение каналов
	get_psgChannelLayout: function () {
		return this._container.psgChannelLayout;
	},
	set_psgChannelLayout: function (value) {
		this._container.psgChannelLayout = value;
	},
	// Громкость сопроцессора
	get_psgVolume: function () {
		return this._container.psgVolume;
	},
	set_psgVolume: function (value) {
		this._container.psgVolume = value;
	},
	// Способ вывода звука
	get_audioRenderer: function () {
		return this._container.audioRenderer;
	},
	set_audioRenderer: function(value) {
		this._container.audioRenderer = value;
	},
	// Размер выходного буфера воспроизведения аудио
	get_audioBufferSize: function() {
		return this._container.audioBufferSize;
	},
	set_audioBufferSize: function(value) {
		this._container.audioBufferSize = value;
	},
	get_threading: function () {
		return this._container.threading;
	},
	set_threading: function(value) {
		this._container.threading = value;
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
		this.set_beeper(ZX_Settings.defaultValues.beeper);
		this.set_beeperVolume(ZX_Settings.defaultValues.beeperVolume);
		this.set_psg(ZX_Settings.defaultValues.psg);
		this.set_psgClock(ZX_Settings.defaultValues.psgClock);
		this.set_psgPacketSize(ZX_Settings.defaultValues.psgPacketSize);
		this.set_psgTurboSound(ZX_Settings.defaultValues.psgTurboSound);
		this.set_psgChannelLayout(ZX_Settings.defaultValues.psgChannelLayout);
		this.set_psgVolume(ZX_Settings.defaultValues.psgVolume);
		this.set_audioRenderer(ZX_Settings.defaultValues.audioRenderer);
		this.set_audioBufferSize(ZX_Settings.defaultValues.audioBufferSize);
		this.set_threading(ZX_Settings.defaultValues.threading);
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
	beeper: true,
	beeperVolume: 0.25,
	psg: VAL_PSG_YM_2149,
	psgClock: 1773400,
	psgPacketSize: 0,
	psgTurboSound: VAL_TS_AUTO,
	psgChannelLayout: VAL_CHANNELS_ABC,
	psgVolume: 0.5,
	audioRenderer: (isScriptProcessorNodeSupported() ? VAL_AUDIO_RENDERER_SPN : (isAudioWorkletNodeSupported() ? VAL_AUDIO_RENDERER_WLN : VAL_AUDIO_RENDERER_UNDEFINED)),
	audioBufferSize: 0,
	threading: VAL_THREADING_SINGLE
};

function ZX_StorableSettings() {
	ZX_StorableSettings.superclass.constructor.apply(this, arguments);
	this._defaultMode = /(\?|&)default=?(&|$)/.test(location.search);

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
		this._container.beeper = this.readFromStorage('beeper');
		this._container.beeperVolume = this.readFromStorage('beeperVolume');
		this._container.psg = this.readFromStorage('psg');
		this._container.psgClock = this.readFromStorage('psgClock');
		this._container.psgPacketSize = this.readFromStorage('psgPacketSize');
		this._container.psgTurboSound = this.readFromStorage('psgTurboSound');
		this._container.psgChannelLayout = this.readFromStorage('psgChannelLayout');
		this._container.psgVolume = this.readFromStorage('psgVolume');
		this._container.audioRenderer = this.readFromStorage('audioRenderer');
		this._container.audioBufferSize = this.readFromStorage('audioBufferSize');
		this._container.threading = this.readFromStorage('threading');
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
	set_beeper: function (value) {
		ZX_StorableSettings.superclass.set_drive.call(this, value);
		this.writeToStorage('beeper', value);
	},
	set_beeperVolume: function (value) {
		ZX_StorableSettings.superclass.set_beeperVolume.call(this, value);
		this.writeToStorage('beeperVolume', value);
	},
	set_psg: function(value) {
		ZX_StorableSettings.superclass.set_psg.call(this, value);
		this.writeToStorage('psg', value);
	},
	set_psgClock: function(value) {
		ZX_StorableSettings.superclass.set_psgClock.call(this, value);
		this.writeToStorage('psgClock', value);
	},
	set_psgPacketSize: function(value) {
		ZX_StorableSettings.superclass.set_psgPacketSize.call(this, value);
		this.writeToStorage('psgPacketSize', value);
	},
	set_psgTurboSound: function (value) {
		ZX_StorableSettings.superclass.set_psgTurboSound.call(this, value);
		this.writeToStorage('psgTurboSound', value);
	},
	set_psgChannelLayout: function (value) {
		ZX_StorableSettings.superclass.set_psgChannelLayout.call(this, value);
		this.writeToStorage('psgChannelLayout', value);
	},
	set_psgVolume: function (value) {
		ZX_StorableSettings.superclass.set_psgVolume.call(this, value);
		this.writeToStorage('psgVolume', value);
	},
	set_audioRenderer: function(value) {
		ZX_StorableSettings.superclass.set_audioRenderer.call(this, value);
		this.writeToStorage('audioRenderer', value);
	},
	set_audioBufferSize: function(value) {
		ZX_StorableSettings.superclass.set_audioBufferSize.call(this, value);
		this.writeToStorage('audioBufferSize', value);
	},
	set_threading: function(value) {
		ZX_StorableSettings.superclass.set_threading.call(this, value);
		this.writeToStorage('threading', value);
	}
});