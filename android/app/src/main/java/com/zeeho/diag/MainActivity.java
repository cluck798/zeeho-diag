package com.zeeho.diag;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.UUID;

public class MainActivity extends Activity {
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private final UUID serviceUuid = UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb");
    private WebView web;
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic writeChar;
    private BluetoothGattCharacteristic notifyChar;
    private String filter = "";

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().getDecorView().setSystemUiVisibility(0);
        BluetoothManager manager = (BluetoothManager)getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager == null ? null : manager.getAdapter();
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "AndroidDiag");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                injectBridge();
                JSONObject state=obj("state");
                try { state.put("state", adapter==null?"unsupported":adapter.isEnabled()?"poweredOn":"poweredOff"); } catch(Exception ignored) {}
                emit(state);
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/diag.html");
        requestBlePermissions();
    }

    private void requestBlePermissions() {
        if (Build.VERSION.SDK_INT >= 31) {
            String[] p = {Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT};
            if (checkSelfPermission(p[0]) != PackageManager.PERMISSION_GRANTED || checkSelfPermission(p[1]) != PackageManager.PERMISSION_GRANTED) requestPermissions(p, 8);
        } else if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, 8);
    }

    private void injectBridge() {
        String js = "window.r485=function(cmd,data,cb){var id='a'+Date.now()+Math.random().toString(16).slice(2);window.__r485Cbs=window.__r485Cbs||{};if(cb)window.__r485Cbs[id]=cb;AndroidDiag.command(cmd,data||'',id)};"+
                "window.__r485Cb=function(id,json){try{var cb=(window.__r485Cbs||{})[id];if(cb){delete window.__r485Cbs[id];cb(JSON.parse(json))}}catch(e){}};"+
                "window.__r485Event=function(e){try{if(window.onR485Event)window.onR485Event(JSON.stringify(e))}catch(x){}};";
        web.evaluateJavascript(js, null);
    }

    private void emit(JSONObject event) { runOnUiThread(() -> web.evaluateJavascript("window.__r485Event(JSON.parse("+JSONObject.quote(event.toString())+"))", null)); }
    private JSONObject obj(String type) { JSONObject o=new JSONObject(); try{o.put("type",type);}catch(Exception ignored){} return o; }
    private boolean permitted() { return Build.VERSION.SDK_INT < 31 || checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)==PackageManager.PERMISSION_GRANTED && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED; }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice d=result.getDevice(); String name=d.getName();
            if(name==null && result.getScanRecord()!=null) name=result.getScanRecord().getDeviceName();
            if(name==null || !filter.isEmpty() && !name.toLowerCase().contains(filter.toLowerCase())) return;
            JSONObject e=obj("device"); try{e.put("id",d.getAddress());e.put("name",name);e.put("rssi",result.getRssi());}catch(Exception ignored){} emit(e);
        }
        @Override public void onScanFailed(int errorCode) { JSONObject e=obj("error");try{e.put("error","BLE 扫描失败: "+errorCode);}catch(Exception ignored){}emit(e); }
    };

    private void scan(String nameFilter) {
        if(!permitted()){requestBlePermissions();return;}
        if(adapter==null || !adapter.isEnabled()){JSONObject e=obj("state");try{e.put("state",adapter==null?"unsupported":"poweredOff");}catch(Exception ignored){}emit(e);return;}
        filter=nameFilter==null?"":nameFilter; scanner=adapter.getBluetoothLeScanner();
        if(scanner!=null){scanner.startScan(scanCallback);emit(obj("scanStarted"));}
    }
    private void stopScan(){try{if(scanner!=null)scanner.stopScan(scanCallback);}catch(SecurityException ignored){}emit(obj("scanStopped"));}
    private void connect(String address){
        stopScan(); try{
            BluetoothDevice d=adapter.getRemoteDevice(address); JSONObject e=obj("connecting");e.put("id",address);e.put("name",d.getName()==null?"":d.getName());emit(e);
            if(gatt!=null)gatt.close(); gatt=d.connectGatt(this,false,gattCallback, BluetoothDevice.TRANSPORT_LE);
        }catch(Exception ex){JSONObject e=obj("error");try{e.put("error","连接失败: "+ex.getMessage());}catch(Exception ignored){}emit(e);}
    }
    private final BluetoothGattCallback gattCallback=new BluetoothGattCallback(){
        @Override public void onConnectionStateChange(BluetoothGatt g,int status,int state){if(state==BluetoothGatt.STATE_CONNECTED){gatt=g;try{JSONObject e=obj("connected");e.put("id",g.getDevice().getAddress());e.put("name",g.getDevice().getName()==null?"":g.getDevice().getName());emit(e);}catch(Exception ignored){}g.discoverServices();}else if(state==BluetoothGatt.STATE_DISCONNECTED){writeChar=null;notifyChar=null;emit(obj("disconnected"));g.close();}}
        @Override public void onServicesDiscovered(BluetoothGatt g,int status){
            JSONArray list=new JSONArray();
            for(android.bluetooth.BluetoothGattService s:g.getServices()){
                JSONArray chars=new JSONArray();for(BluetoothGattCharacteristic c:s.getCharacteristics()){
                    int p=c.getProperties();JSONObject ci=new JSONObject();try{ci.put("uuid",c.getUuid().toString());ci.put("write",(p&(BluetoothGattCharacteristic.PROPERTY_WRITE|BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE))!=0);ci.put("notify",(p&(BluetoothGattCharacteristic.PROPERTY_NOTIFY|BluetoothGattCharacteristic.PROPERTY_INDICATE))!=0);}catch(Exception ignored){}chars.put(ci);
                    String u=c.getUuid().toString().toLowerCase();if(u.contains("ffe1")&&(p&(BluetoothGattCharacteristic.PROPERTY_WRITE|BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE))!=0)writeChar=c;if(u.contains("ffe2")&&(p&(BluetoothGattCharacteristic.PROPERTY_NOTIFY|BluetoothGattCharacteristic.PROPERTY_INDICATE))!=0)notifyChar=c;
                }
                JSONObject si=new JSONObject();try{si.put("uuid",s.getUuid().toString());si.put("chars",chars);}catch(Exception ignored){}list.put(si);
                if(s.getUuid().equals(serviceUuid)){for(BluetoothGattCharacteristic c:s.getCharacteristics()){int p=c.getProperties();String u=c.getUuid().toString().toLowerCase();if(writeChar==null&&u.contains("ffe1")&&(p&(BluetoothGattCharacteristic.PROPERTY_WRITE|BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE))!=0)writeChar=c;if(notifyChar==null&&u.contains("ffe2")&&(p&(BluetoothGattCharacteristic.PROPERTY_NOTIFY|BluetoothGattCharacteristic.PROPERTY_INDICATE))!=0)notifyChar=c;}}
            }
            JSONObject se=obj("services");try{se.put("list",list);}catch(Exception ignored){}emit(se);
            if(notifyChar!=null){g.setCharacteristicNotification(notifyChar,true);BluetoothGattDescriptor d=notifyChar.getDescriptor(CCCD);if(d!=null){d.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);g.writeDescriptor(d);}}
            JSONObject r=obj("ready");try{r.put("write",writeChar==null?"":writeChar.getUuid().toString());r.put("notify",notifyChar==null?"":notifyChar.getUuid().toString());r.put("ok",writeChar!=null&&notifyChar!=null);}catch(Exception ignored){}emit(r);
        }
        @Override public void onCharacteristicChanged(BluetoothGatt g,BluetoothGattCharacteristic c){onData(c.getValue());}
        @Override public void onCharacteristicChanged(BluetoothGatt g,BluetoothGattCharacteristic c,byte[] value){onData(value);}
        private void onData(byte[] b){if(b==null)return;JSONObject e=obj("data");StringBuilder h=new StringBuilder();for(byte x:b)h.append(String.format("%02X",x));try{e.put("hex",h.toString());e.put("len",b.length);}catch(Exception ignored){}emit(e);}
    };
    private void sendHex(String hex){if(gatt==null||writeChar==null){emit(obj("error"));return;}String clean=hex.replaceAll("[^0-9a-fA-F]","");byte[] b=new byte[clean.length()/2];for(int i=0;i<b.length;i++)b[i]=(byte)Integer.parseInt(clean.substring(i*2,i*2+2),16);int type=(writeChar.getProperties()&BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE)!=0?BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE:BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT;writeChar.setWriteType(type);int max=Math.max(20,Math.min(180, gatt.getDevice().getBondState()==BluetoothDevice.BOND_BONDED?180:20));for(int off=0;off<b.length;off+=max){byte[] chunk=java.util.Arrays.copyOfRange(b,off,Math.min(b.length,off+max));writeChar.setValue(chunk);gatt.writeCharacteristic(writeChar);try{Thread.sleep(30);}catch(InterruptedException ignored){}}JSONObject e=obj("tx");try{e.put("hex",clean.toUpperCase());e.put("len",b.length);}catch(Exception ignored){}emit(e);}

    private class Bridge {
        @JavascriptInterface public void command(String cmd,String data,String id){runOnUiThread(()->{
            switch(cmd){case "scan":scan(data);break;case "stopScan":stopScan();break;case "connect":connect(data);break;case "disconnect":if(gatt!=null)gatt.disconnect();break;case "send":sendHex(data);callback(id,"{\"ok\":"+(gatt!=null&&writeChar!=null)+"}");break;case "state":JSONObject e=obj("state");try{e.put("state",adapter==null?"unsupported":adapter.isEnabled()?"poweredOn":"poweredOff");}catch(Exception ignored){}emit(e);break;default:break;}
        });}
    }
    private void callback(String id,String json){if(id!=null&&!id.isEmpty())web.evaluateJavascript("window.__r485Cb("+JSONObject.quote(id)+","+JSONObject.quote(json)+")",null);}
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){stopScan();if(gatt!=null)gatt.close();web.destroy();super.onDestroy();}
}
