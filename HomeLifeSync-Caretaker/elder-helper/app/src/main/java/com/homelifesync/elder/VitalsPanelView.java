package com.homelifesync.elder;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.Choreographer;
import android.view.View;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;

/**
 * A single patient-monitor style panel showing all six vitals as live
 * scrolling waveforms: HR (ECG P-Q-R-S-T spikes), SpO₂, RESP (breath waves),
 * BP (systolic + diastolic), TEMP and GLUC (slow drifts).
 *
 * Feed it once a second from the vitals loop via {@link #feed(int, int, int,
 * double, int, int, int, String, String)}. Samples are stamped into the
 * buffers instantly but revealed gradually on a vsync-aligned loop so the
 * trace sweeps smoothly instead of jumping a whole second at a time.
 * Per-frame allocations are avoided (reused Paths, no boxed math) so the
 * main thread stays cheap.
 */
public class VitalsPanelView extends View {

    private static final int SUB_PER_SEC = 30;
    private static final int MAX_SAMPLES = SUB_PER_SEC * 14;
    private static final int N_STRIPS    = 6;
    private static final int HISTORY     = SUB_PER_SEC * 12;

    // Reveal a bit faster than the 1 Hz feed rate so older pending chunks drain.
    private static final float REVEAL_PER_SEC = SUB_PER_SEC * 1.3f;

    private static final int IDX_HR   = 0;
    private static final int IDX_SPO2 = 1;
    private static final int IDX_RESP = 2;
    private static final int IDX_BP   = 3;
    private static final int IDX_TEMP = 4;
    private static final int IDX_GLUC = 5;

    private final String[] labels = {"HR", "SpO₂", "RESP", "BP", "TEMP", "GLUC"};
    private final double[] minVals = {20, 80, 0, 40, 34, 40};
    private final double[] maxVals = {240, 100, 40, 210, 41, 320};

    private final Paint bgPaint       = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint gridPaint     = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint sweepPaint    = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dividerPaint  = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint labelPaint    = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint chipBgPaint   = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint chipTextPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    private final Paint[] tracePaints;
    private final int[] baseColors = {
        0xFF22C55E, 0xFF38BDF8, 0xFFFACC15, 0xFFF87171, 0xFFFB923C, 0xFFC084FC
    };
    private final Paint sysPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint diaPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    @SuppressWarnings("unchecked")
    private final List<Float>[] bufs = new ArrayList[N_STRIPS];
    private final List<Float> sysBuf = new ArrayList<>();
    private final List<Float> diaBuf = new ArrayList<>();

    private final Path[] paths   = new Path[N_STRIPS];
    private final Path sysPath   = new Path();
    private final Path diaPath   = new Path();

    private final float[] phases   = new float[N_STRIPS];
    private final float[] wobbles  = new float[N_STRIPS];
    private final String[] chipTexts = new String[N_STRIPS];
    private final float[] chipWidths = new float[N_STRIPS];

    // Number of appended samples per strip still waiting to be revealed.
    private final float[] toReveal = new float[N_STRIPS];

    private int ecgColor = 0xFF22C55E;
    private boolean irregular    = false;
    private boolean stElevation  = false;
    private boolean seeded       = false;
    private boolean animating    = false;
    private long lastFrameNanos  = 0L;

    private final Random rng = new Random();
    private final Choreographer.FrameCallback frameCb = new Choreographer.FrameCallback() {
        @Override public void doFrame(long frameTimeNanos) {
            float dt = clampDt((frameTimeNanos - lastFrameNanos) / 1e9f);
            lastFrameNanos = frameTimeNanos;
            boolean any = false;
            for (int i = 0; i < N_STRIPS; i++) {
                if (toReveal[i] > 0f) {
                    toReveal[i] = Math.max(0f, toReveal[i] - REVEAL_PER_SEC * dt);
                    if (toReveal[i] > 0f) any = true;
                }
            }
            invalidate();
            if (any) Choreographer.getInstance().postFrameCallback(this);
            else animating = false;
        }
    };

    public VitalsPanelView(Context c) { this(c, null); }
    public VitalsPanelView(Context c, AttributeSet a) { this(c, a, 0); }
    public VitalsPanelView(Context c, AttributeSet a, int def) {
        super(c, a, def);

        bgPaint.setColor(0xFF0B1220);
        gridPaint.setColor(0xFF1F2A37);
        gridPaint.setStrokeWidth(dp(1f));
        sweepPaint.setColor(0x2FFFFFFF);
        sweepPaint.setStrokeWidth(dp(1f));
        dividerPaint.setColor(0xFF16202E);
        dividerPaint.setStrokeWidth(dp(1f));

        float textSize = getResources().getDisplayMetrics().scaledDensity * 10f;
        labelPaint.setTextSize(textSize);
        labelPaint.setFakeBoldText(true);

        chipTextPaint.setColor(0xFF0B1220);
        chipTextPaint.setTextSize(textSize);
        chipTextPaint.setFakeBoldText(true);

        tracePaints = new Paint[N_STRIPS];
        for (int i = 0; i < N_STRIPS; i++) {
            bufs[i] = new ArrayList<>();
            paths[i] = new Path();
            tracePaints[i] = new Paint(Paint.ANTI_ALIAS_FLAG);
            tracePaints[i].setStyle(Paint.Style.STROKE);
            tracePaints[i].setStrokeWidth(dp(2f));
            tracePaints[i].setStrokeCap(Paint.Cap.ROUND);
            tracePaints[i].setStrokeJoin(Paint.Join.ROUND);
            tracePaints[i].setColor(baseColors[i]);
            phases[i] = rng.nextFloat();
            wobbles[i] = rng.nextFloat() * 6f;
            chipTexts[i] = "--";
        }

        sysPaint.setStyle(Paint.Style.STROKE);
        sysPaint.setStrokeWidth(dp(2f));
        sysPaint.setStrokeCap(Paint.Cap.ROUND);
        sysPaint.setColor(0xFFF87171);
        diaPaint.setStyle(Paint.Style.STROKE);
        diaPaint.setStrokeWidth(dp(1.5f));
        diaPaint.setStrokeCap(Paint.Cap.ROUND);
        diaPaint.setColor(0xFF818CF8);
    }

    /** Feed current vitals once per second; waveforms are synthesised here. */
    public void feed(int hr, int spo2, int resp,
                     double temp, int sys, int dia, int gluc,
                     String condition, String severity) {

        ecgColor = "CRITICAL".equals(severity) ? 0xFFEF4444
                 : "WARNING".equals(severity)  ? 0xFFF59E0B
                 : 0xFF22C55E;
        String c = condition == null ? "" : condition.toUpperCase();
        irregular   = c.contains("ATRIAL") || c.contains("ARRHYTH");
        stElevation = c.contains("INFARCT");

        chipTexts[IDX_HR]   = String.valueOf(hr);
        chipTexts[IDX_SPO2] = spo2 + "%";
        chipTexts[IDX_RESP] = String.valueOf(resp);
        chipTexts[IDX_BP]   = sys + "/" + dia;
        chipTexts[IDX_TEMP] = String.format(Locale.US, "%.1f°", temp);
        chipTexts[IDX_GLUC] = String.valueOf(gluc);

        int loops = seeded ? 1 : HISTORY / SUB_PER_SEC;
        for (int l = 0; l < loops; l++) {
            genHR(hr);
            genSpo2(spo2);
            genResp(resp);
            genBP(sys, dia);
            genTemp(temp);
            genGluc(gluc);
        }
        for (int i = 0; i < N_STRIPS; i++) chipWidths[i] = chipTextPaint.measureText(chipTexts[i]);
        revealChunk(loops == 1 ? SUB_PER_SEC : 0);
        seeded = true;

        invalidate();
        kickReveal();
    }

    public void reset() {
        for (int i = 0; i < N_STRIPS; i++) { bufs[i].clear(); toReveal[i] = 0f; }
        sysBuf.clear();
        diaBuf.clear();
        toReveal[IDX_BP] = 0f;
        seeded = false;
        postInvalidate();
    }

    /** Record how many samples just entered each strip's visible pipeline. */
    private void revealChunk(int chunk) {
        if (chunk <= 0) return;
        for (int i = 0; i < N_STRIPS; i++) toReveal[i] += chunk;
    }

    private void kickReveal() {
        if (animating) return;
        boolean any = false;
        for (int i = 0; i < N_STRIPS; i++) if (toReveal[i] > 0f) { any = true; break; }
        if (!any) return;
        animating = true;
        lastFrameNanos = System.nanoTime();
        Choreographer.getInstance().postFrameCallback(frameCb);
    }

    // ── Waveform generators (one second of samples per call) ─────────

    private void genHR(int hr) {
        float beatsPerSub = (hr / 60f) / SUB_PER_SEC;
        for (int s = 0; s < SUB_PER_SEC; s++) {
            float inc = beatsPerSub;
            float amp = 1f;
            if (irregular) {
                inc = beatsPerSub * (0.55f + 0.9f * rng.nextFloat());
                amp = 0.7f + 0.6f * rng.nextFloat();
            }
            phases[IDX_HR] += inc;
            if (phases[IDX_HR] >= 1f) phases[IDX_HR] -= 1f;
            float v = (ecgShape(phases[IDX_HR]) + 0.015f * (float) Math.sin(wobbles[IDX_HR])) * amp;
            wobbles[IDX_HR] += 0.34f;
            add(bufs[IDX_HR], clamp01(v));
        }
    }

    private void genSpo2(int spo2) {
        double base = norm(spo2, IDX_SPO2);
        for (int s = 0; s < SUB_PER_SEC; s++) {
            wobbles[IDX_SPO2] += 0.12f;
            double v = base + 0.012 * Math.sin(wobbles[IDX_SPO2])
                     + (rng.nextDouble() - 0.5) * 0.008;
            add(bufs[IDX_SPO2], clamp01((float) v));
        }
    }

    private void genResp(int resp) {
        float inc = (float) (2 * Math.PI * (resp / 60f)) / SUB_PER_SEC;
        for (int s = 0; s < SUB_PER_SEC; s++) {
            phases[IDX_RESP] += inc;
            double p = phases[IDX_RESP];
            double v = 0.5 + 0.36 * Math.sin(p)
                     + 0.10 * Math.sin(2 * p + 0.4)
                     + (rng.nextDouble() - 0.5) * 0.02;
            add(bufs[IDX_RESP], clamp01((float) v));
        }
    }

    private void genBP(int sys, int dia) {
        double s = norm(sys, IDX_BP);
        double d = norm(dia, IDX_BP);
        for (int t = 0; t < SUB_PER_SEC; t++) {
            wobbles[IDX_BP] += 0.22;
            double w = wobbles[IDX_BP];
            double sv = s + 0.018 * Math.sin(w) + (rng.nextDouble() - 0.5) * 0.004;
            double dv = d + 0.014 * Math.sin(w + 1.1) + (rng.nextDouble() - 0.5) * 0.004;
            add(sysBuf, clamp01((float) sv));
            add(diaBuf, clamp01((float) dv));
        }
    }

    private void genTemp(double temp) {
        double base = (temp - minVals[IDX_TEMP]) / (maxVals[IDX_TEMP] - minVals[IDX_TEMP]);
        for (int s = 0; s < SUB_PER_SEC; s++) {
            wobbles[IDX_TEMP] += 0.004;
            double v = base + 0.006 * Math.sin(wobbles[IDX_TEMP])
                     + (rng.nextDouble() - 0.5) * 0.0012;
            add(bufs[IDX_TEMP], clamp01((float) v));
        }
    }

    private void genGluc(int gluc) {
        double base = norm(gluc, IDX_GLUC);
        for (int s = 0; s < SUB_PER_SEC; s++) {
            wobbles[IDX_GLUC] += 0.008;
            double v = base + 0.004 * Math.sin(wobbles[IDX_GLUC])
                     + (rng.nextDouble() - 0.5) * 0.002;
            add(bufs[IDX_GLUC], clamp01((float) v));
        }
    }

    private float ecgShape(float p) {
        if (p <= 0.02f)  return 0.48f;
        if (p < 0.09f)   return 0.48f + 0.07f * (float) Math.sin(Math.PI * (p - 0.02f) / 0.07f);
        if (p < 0.12f)   return 0.48f;
        if (p < 0.14f)   return 0.48f - 0.22f * (float) Math.sin(Math.PI * (p - 0.12f) / 0.02f);
        if (p < 0.19f) {
            float d = p - 0.165f;
            return 0.48f + 0.55f * (float) Math.exp(-(d * d) / 0.00022f);
        }
        if (p < 0.215f)  return 0.48f - 0.28f * (float) Math.sin(Math.PI * (p - 0.19f) / 0.025f);
        if (p < 0.32f)   return 0.48f + (stElevation ? 0.12f : 0f);
        if (p < 0.50f)   return 0.48f + 0.18f * (float) Math.sin(Math.PI * (p - 0.32f) / 0.18f);
        return 0.48f;
    }

    private static void add(List<Float> buf, float v) {
        buf.add(v);
        if (buf.size() > MAX_SAMPLES) buf.remove(0);
    }

    private double norm(double v, int i) {
        return (v - minVals[i]) / (maxVals[i] - minVals[i]);
    }

    private static float clamp01(float v) {
        return v < 0f ? 0f : (v > 1f ? 1f : v);
    }

    private static float clampDt(float v) {
        return v < 0f ? 0f : (v > 0.1f ? 0.1f : v);
    }

    // ── Drawing ──────────────────────────────────────────────────────

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float w = getWidth(), h = getHeight();
        float pad = dp(12f);
        float radius = dp(14f);

        canvas.drawRoundRect(new RectF(0, 0, w, h), radius, radius, bgPaint);

        float chipW   = dp(44f);
        float chartX0 = dp(46f);
        float chartX1 = w - pad - chipW;
        float stripH  = (h - pad * 2f) / N_STRIPS;

        for (int i = 0; i < N_STRIPS; i++) {
            float top = pad + i * stripH;
            float bot = pad + (i + 1) * stripH;
            float mid = (top + bot) / 2f;
            float chartTop = top + dp(3f);
            float chartBot = bot - dp(3f);
            float chartH   = chartBot - chartTop;

            if (i > 0) {
                canvas.drawLine(chartX0, top, chartX1, top, dividerPaint);
            }

            canvas.drawLine(chartX0, mid, chartX1, mid, gridPaint);
            canvas.drawLine(chartX1, chartTop, chartX1, chartBot, sweepPaint);

            labelPaint.setColor(i == IDX_HR ? ecgColor : baseColors[i]);
            canvas.drawText(labels[i], pad + dp(4f), top + dp(12f), labelPaint);

            int chipColor = i == IDX_BP ? 0xFFF87171 : (i == IDX_HR ? ecgColor : baseColors[i]);
            chipBgPaint.setColor(chipColor);
            String txt = chipTexts[i];
            float cw = chipWidths[i] + dp(10f);
            float cy = top + dp(2f);
            canvas.drawRoundRect(new RectF(w - pad - cw, cy, w - pad, cy + dp(14f)), dp(4f), dp(4f), chipBgPaint);
            canvas.drawText(txt, w - pad - cw + dp(5f), cy + dp(10.5f), chipTextPaint);

            if (i == IDX_BP) {
                drawTrace(canvas, sysBuf, sysPath, chartX0, chartX1, chartTop, chartH, sysPaint, IDX_BP);
                drawTrace(canvas, diaBuf, diaPath, chartX0, chartX1, chartTop, chartH, diaPaint, IDX_BP);
            } else {
                drawTrace(canvas, bufs[i], paths[i], chartX0, chartX1, chartTop, chartH, tracePaints[i], i);
            }
        }
    }

    /**
     * Draw the visible portion of one strip's waveform. Samples newest at the
     * right; the reveal accumulator trims unrendered samples so the leading
     * edge advances smoothly rather than jumping per second.
     */
    private void drawTrace(Canvas canvas, List<Float> buf, Path path,
                           float x0, float x1, float top, float chartH,
                           Paint paint, int stripIdx) {
        int size = buf.size();
        if (size == 0) return;

        float count = size - toReveal[stripIdx];
        if (count <= 0f) return;

        float step = (x1 - x0) / MAX_SAMPLES;
        path.rewind();

        int nFull = (int) count;
        float frac = count - nFull;
        float x = x1;
        if (nFull == 0) {
            // Only a sliver revealed — lead from the sweep line.
            float y = top + (1f - buf.get(size - 1)) * chartH;
            path.moveTo(x1, y);
            path.lineTo(x1 + step * frac, y);
        } else {
            for (int k = 0; k < nFull && k < size; k++) {
                float y = top + (1f - buf.get(size - 1 - k)) * chartH;
                if (k == 0) path.moveTo(x, y);
                else        path.lineTo(x, y);
                x -= step;
            }
            // Ease the leading edge from the last full sample toward the next.
            if (frac > 0f && nFull < size) {
                float y = top + (1f - buf.get(size - 1 - nFull)) * chartH;
                path.lineTo(x + step * frac, y);
            }
        }
        canvas.drawPath(path, paint);
    }

    private float dp(float v) {
        return v * getResources().getDisplayMetrics().density;
    }
}