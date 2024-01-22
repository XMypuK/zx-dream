/* Author: Peter Sovietov */
/* Javascript version: Alexander Kovalenko */

/*
The MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

const DECIMATE_FACTOR = 8;
const FIR_SIZE = 192;
const DC_FILTER_SIZE = 1024;

const AY_DAC_TABLE = [
  0.0, 0.0,
  0.00999465934234, 0.00999465934234,
  0.0144502937362, 0.0144502937362,
  0.0210574502174, 0.0210574502174,
  0.0307011520562, 0.0307011520562,
  0.0455481803616, 0.0455481803616,
  0.0644998855573, 0.0644998855573,
  0.107362478065, 0.107362478065,
  0.126588845655, 0.126588845655,
  0.20498970016, 0.20498970016,
  0.292210269322, 0.292210269322,
  0.372838941024, 0.372838941024,
  0.492530708782, 0.492530708782,
  0.635324635691, 0.635324635691,
  0.805584802014, 0.805584802014,
  1.0, 1.0
]

const YM_DAC_TABLE = [
  0.0, 0.0,
  0.00465400167849, 0.00772106507973,
  0.0109559777218, 0.0139620050355,
  0.0169985503929, 0.0200198367285,
  0.024368657969, 0.029694056611,
  0.0350652323186, 0.0403906309606,
  0.0485389486534, 0.0583352407111,
  0.0680552376593, 0.0777752346075,
  0.0925154497597, 0.111085679408,
  0.129747463188, 0.148485542077,
  0.17666895552, 0.211551079576,
  0.246387426566, 0.281101701381,
  0.333730067903, 0.400427252613,
  0.467383840696, 0.53443198291,
  0.635172045472, 0.75800717174,
  0.879926756695, 1.0
]

function Ayumi() {
  this.channels = this.getChannels();

  this.noisePeriod = 0;
  this.noiseCounter = 0;
  this.noise = 0;

  this.envelopes = this.getEnvelopeShapes();
  this.envelopeCounter = 0;
  this.envelopePeriod = 0;
  this.envelopeShape = 0;
  this.envelopeSegment = 0;
  this.envelope = 0;

  this.dacTable = YM_DAC_TABLE;

  this.step = 0.0;
  this.x = 0.0;

  this.left = 0.0;
  this.right = 0.0;

  this.interpolatorLeft = {
   c: new Float64Array(4),
   y: new Float64Array(4)
  }
  this.interpolatorRight = {
   c: new Float64Array(4),
   y: new Float64Array(4)
  }

  this.dcFilterLeft = {
   sum: 0.0,
   delay: new Float64Array(DC_FILTER_SIZE)
  }
  this.dcFilterRight = {
   sum: 0.0,
   delay: new Float64Array(DC_FILTER_SIZE)
  }
  this.dcIndex = 0;

  this.firLeft = new Float64Array(FIR_SIZE * 2);
  this.firRight = new Float64Array(FIR_SIZE * 2);
  this.firIndex = 0;
}

Ayumi.prototype.Channel = function() {
  return {
      toneCounter: 0, tonePeriod: 0, tone: 0,
      tOff: 0, nOff: 0, eOn: 0,
      volume: 0,
      panLeft: 1.0, panRight: 1.0
  };
}

Ayumi.prototype.getChannels = function() {
  return [
    new this.Channel,
    new this.Channel,
    new this.Channel
  ];
}

Ayumi.prototype.getEnvelopeShapes = function() {
  return [
    [ this.slideDown, this.holdBottom ],
    [ this.slideDown, this.holdBottom ],
    [ this.slideDown, this.holdBottom ],
    [ this.slideDown, this.holdBottom ],

    [ this.slideUp, this.holdBottom ],
    [ this.slideUp, this.holdBottom ],
    [ this.slideUp, this.holdBottom ],
    [ this.slideUp, this.holdBottom ],

    [ this.slideDown, this.slideDown ],
    [ this.slideDown, this.holdBottom ],
    [ this.slideDown, this.slideUp ],
    [ this.slideDown, this.holdTop ],

    [ this.slideUp, this.slideUp ],
    [ this.slideUp, this.holdTop ],
    [ this.slideUp, this.slideDown ],
    [ this.slideUp, this.holdBottom ]
  ]
};

Ayumi.prototype.updateTone = function(index) {
  var ch = this.channels[index];
  if(++ch.toneCounter >= ch.tonePeriod) {
    ch.toneCounter = 0;
    ch.tone ^= 1;
  }
  return ch.tone;
}

Ayumi.prototype.updateNoise = function() {
  if(++this.noiseCounter >= (this.noisePeriod << 1)) {
    this.noiseCounter = 0;
    var bit0x3 = (this.noise ^ (this.noise >> 3)) & 1;
    this.noise = (this.noise >> 1) | (bit0x3 << 16);
  }
  return this.noise & 1;
}

Ayumi.prototype.slideUp = function(e) {
  if(++e.envelope > 31) {
    e.envelopeSegment ^= 1;
    e.resetSegment();
  }
}

Ayumi.prototype.slideDown = function(e) {
  if(--e.envelope < 0) {
    e.envelopeSegment ^= 1;
    e.resetSegment();
  }
}

Ayumi.prototype.holdTop = function(e) {};

Ayumi.prototype.holdBottom = function(e) {};

Ayumi.prototype.resetSegment = function() {
  var env = this.envelopes[this.envelopeShape][this.envelopeSegment];
  this.envelope = (env == this.slideDown || env == this.holdTop) ? 31 : 0;
}

Ayumi.prototype.updateEnvelope = function() {
  if(++this.envelopeCounter >= this.envelopePeriod) {
    this.envelopeCounter = 0;
    this.envelopes[this.envelopeShape][this.envelopeSegment](this);
  }
  return this.envelope;
}

Ayumi.prototype.updateMixer = function() {
  var out;
  var noise = this.updateNoise();
  var envelope = this.updateEnvelope();
  this.left = 0;
  this.right = 0;
  for(var i = 0; i < this.channels.length; i++) {
    out = (this.updateTone(i) | this.channels[i].tOff) &
      (noise | this.channels[i].nOff);
    out *= this.channels[i].eOn ? envelope : this.channels[i].volume * 2 + 1;
    this.left += this.dacTable[out] * this.channels[i].panLeft;
    this.right += this.dacTable[out] * this.channels[i].panRight;
  }
}

Ayumi.prototype.configure = function(isYM, clockRate, sr) {
  this.step = clockRate / (sr * 8 * DECIMATE_FACTOR);
  this.dacTable = isYM ? YM_DAC_TABLE : AY_DAC_TABLE;
  this.noise = 1;
}

Ayumi.prototype.setPan = function(index, pan, isEqp) {
  if(isEqp) {
    this.channels[index].panLeft = Math.sqrt(1 - pan);
    this.channels[index].panRight = Math.sqrt(pan);
  } else {
    this.channels[index].panLeft = 1 - pan;
    this.channels[index].panRight = pan;
  }
}

Ayumi.prototype.setTone = function(index, period) {
  period &= 0xfff;
  this.channels[index].tonePeriod = (period == 0) | period;
}

Ayumi.prototype.setNoise = function(period) {
  period &= 0x1f;
  this.noisePeriod = +(period == 0) | period;
}

Ayumi.prototype.setMixer = function(index, tOff, nOff, eOn) {
  this.channels[index].tOff = tOff & 1;
  this.channels[index].nOff = nOff & 1;
  this.channels[index].eOn = eOn & 1;
}

Ayumi.prototype.setVolume = function(index, volume) {
  this.channels[index].volume = volume & 0x0f;
}

Ayumi.prototype.setEnvelope = function(period) {
  period &= 0xffff;
  this.envelopePeriod = (period == 0) | period;
}

Ayumi.prototype.setEnvelopeShape = function(shape) {
  this.envelopeShape = shape & 0x0f;
  this.envelopeCounter = 0;
  this.envelopeSegment = 0;
  this.resetSegment();
}

Ayumi.prototype.decimate = function(x) {
  var y = -0.0000046183113992051936 * (x[1] + x[191]) +
    -0.00001117761640887225 * (x[2] + x[190]) +
    -0.000018610264502005432 * (x[3] + x[189]) +
    -0.000025134586135631012 * (x[4] + x[188]) +
    -0.000028494281690666197 * (x[5] + x[187]) +
    -0.000026396828793275159 * (x[6] + x[186]) +
    -0.000017094212558802156 * (x[7] + x[185]) +
    0.000023798193576966866 * (x[9] + x[183]) +
    0.000051281160242202183 * (x[10] + x[182]) +
    0.00007762197826243427 * (x[11] + x[181]) +
    0.000096759426664120416 * (x[12] + x[180]) +
    0.00010240229300393402 * (x[13] + x[179]) +
    0.000089344614218077106 * (x[14] + x[178]) +
    0.000054875700118949183 * (x[15] + x[177]) +
    -0.000069839082210680165 * (x[17] + x[175]) +
    -0.0001447966132360757 * (x[18] + x[174]) +
    -0.00021158452917708308 * (x[19] + x[173]) +
    -0.00025535069106550544 * (x[20] + x[172]) +
    -0.00026228714374322104 * (x[21] + x[171]) +
    -0.00022258805927027799 * (x[22] + x[170]) +
    -0.00013323230495695704 * (x[23] + x[169]) +
    0.00016182578767055206 * (x[25] + x[167]) +
    0.00032846175385096581 * (x[26] + x[166]) +
    0.00047045611576184863 * (x[27] + x[165]) +
    0.00055713851457530944 * (x[28] + x[164]) +
    0.00056212565121518726 * (x[29] + x[163]) +
    0.00046901918553962478 * (x[30] + x[162]) +
    0.00027624866838952986 * (x[31] + x[161]) +
    -0.00032564179486838622 * (x[33] + x[159]) +
    -0.00065182310286710388 * (x[34] + x[158]) +
    -0.00092127787309319298 * (x[35] + x[157]) +
    -0.0010772534348943575 * (x[36] + x[156]) +
    -0.0010737727700273478 * (x[37] + x[155]) +
    -0.00088556645390392634 * (x[38] + x[154]) +
    -0.00051581896090765534 * (x[39] + x[153]) +
    0.00059548767193795277 * (x[41] + x[151]) +
    0.0011803558710661009 * (x[42] + x[150]) +
    0.0016527320270369871 * (x[43] + x[149]) +
    0.0019152679330965555 * (x[44] + x[148]) +
    0.0018927324805381538 * (x[45] + x[147]) +
    0.0015481870327877937 * (x[46] + x[146]) +
    0.00089470695834941306 * (x[47] + x[145]) +
    -0.0010178225878206125 * (x[49] + x[143]) +
    -0.0020037400552054292 * (x[50] + x[142]) +
    -0.0027874356824117317 * (x[51] + x[141]) +
    -0.003210329988021943 * (x[52] + x[140]) +
    -0.0031540624117984395 * (x[53] + x[139]) +
    -0.0025657163651900345 * (x[54] + x[138]) +
    -0.0014750752642111449 * (x[55] + x[137]) +
    0.0016624165446378462 * (x[57] + x[135]) +
    0.0032591192839069179 * (x[58] + x[134]) +
    0.0045165685815867747 * (x[59] + x[133]) +
    0.0051838984346123896 * (x[60] + x[132]) +
    0.0050774264697459933 * (x[61] + x[131]) +
    0.0041192521414141585 * (x[62] + x[130]) +
    0.0023628575417966491 * (x[63] + x[129]) +
    -0.0026543507866759182 * (x[65] + x[127]) +
    -0.0051990251084333425 * (x[66] + x[126]) +
    -0.0072020238234656924 * (x[67] + x[125]) +
    -0.0082672928192007358 * (x[68] + x[124]) +
    -0.0081033739572956287 * (x[69] + x[123]) +
    -0.006583111539570221 * (x[70] + x[122]) +
    -0.0037839040415292386 * (x[71] + x[121]) +
    0.0042781252851152507 * (x[73] + x[119]) +
    0.0084176358598320178 * (x[74] + x[118]) +
    0.01172566057463055 * (x[75] + x[117]) +
    0.013550476647788672 * (x[76] + x[116]) +
    0.013388189369997496 * (x[77] + x[115]) +
    0.010979501242341259 * (x[78] + x[114]) +
    0.006381274941685413 * (x[79] + x[113]) +
    -0.007421229604153888 * (x[81] + x[111]) +
    -0.01486456304340213 * (x[82] + x[110]) +
    -0.021143584622178104 * (x[83] + x[109]) +
    -0.02504275058758609 * (x[84] + x[108]) +
    -0.025473530942547201 * (x[85] + x[107]) +
    -0.021627310017882196 * (x[86] + x[106]) +
    -0.013104323383225543 * (x[87] + x[105]) +
    0.017065133989980476 * (x[89] + x[103]) +
    0.036978919264451952 * (x[90] + x[102]) +
    0.05823318062093958 * (x[91] + x[101]) +
    0.079072012081405949 * (x[92] + x[100]) +
    0.097675998716952317 * (x[93] + x[99]) +
    0.11236045936950932 * (x[94] + x[98]) +
    0.12176343577287731 * (x[95] + x[97]) +
    0.125 * x[96];
  for(var i = 0; i < DECIMATE_FACTOR; i++) {
    x[FIR_SIZE - DECIMATE_FACTOR + i] = x[i];
  }
  return y;
}

Ayumi.prototype.process = function() {
  var y1;

  var cLeft = this.interpolatorLeft.c;
  var yLeft = this.interpolatorLeft.y;

  var cRight = this.interpolatorRight.c;
  var yRight = this.interpolatorRight.y;

  var firOffset = FIR_SIZE - this.firIndex * DECIMATE_FACTOR;
  var firLeft = this.firLeft.subarray(firOffset);
  var firRight = this.firRight.subarray(firOffset);

  this.firIndex = (this.firIndex + 1) % (FIR_SIZE / DECIMATE_FACTOR - 1);

  for(var i = DECIMATE_FACTOR - 1; i >= 0; i--) {
    this.x += this.step;
    if(this.x >= 1) {
      this.x--;
      yLeft[0] = yLeft[1];
      yLeft[1] = yLeft[2];
      yLeft[2] = yLeft[3];

      yRight[0] = yRight[1];
      yRight[1] = yRight[2];
      yRight[2] = yRight[3];

      this.updateMixer();

      yLeft[3] = this.left;
      yRight[3] = this.right;

      y1 = yLeft[2] - yLeft[0];
      cLeft[0] = 0.5 * yLeft[1] + 0.25 * (yLeft[0] + yLeft[2]);
      cLeft[1] = 0.5 * y1;
      cLeft[2] = 0.25 * (yLeft[3] - yLeft[1] - y1);

      y1 = yRight[2] - yRight[0];
      cRight[0] = 0.5 * yRight[1] + 0.25 * (yRight[0] + yRight[2]);
      cRight[1] = 0.5 * y1;
      cRight[2] = 0.25 * (yRight[3] - yRight[1] - y1);
    }
    firLeft[i] = (cLeft[2] * this.x + cLeft[1]) * this.x + cLeft[0];
    firRight[i] = (cRight[2] * this.x + cRight[1]) * this.x + cRight[0];
  }

  this.left = this.decimate(firLeft);
  this.right = this.decimate(firRight);
}

Ayumi.prototype.dcFilter = function(dc, index, x) {
  dc.sum += -dc.delay[index] + x;
  dc.delay[index] = x;
  return x - dc.sum / DC_FILTER_SIZE;
}

Ayumi.prototype.removeDC = function() {
  this.left = this.dcFilter(this.dcFilterLeft, this.dcIndex, this.left);
  this.right = this.dcFilter(this.dcFilterRight, this.dcIndex, this.right);
  this.dcIndex = (this.dcIndex + 1) & (DC_FILTER_SIZE - 1);
}
