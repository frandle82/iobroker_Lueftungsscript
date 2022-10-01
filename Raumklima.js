//
// Raumklima - v0.6.7
//
// Berechnet Taupunkt, absolute Luftfeuchtigkeit, Enthalpie, Lüftungsempfehlung,
// gemessene Temperatur & Luftfeuchtigkeit inkl. Offset zwecks Kalibrierung
// -----------------------------------------------------------------------------
//
// Formeln zur Berechnung der Luftfeuchtigkeit:
// http://www.nabu-eibelshausen.de/Rechner/feuchte_luft_enthalpie.html
//
// Empfehlung Paul53:
// Kalibrierung der Offsetwerte in einer für den Vergleich relevanten Umgebung
// z.B. 22°C, 65% Luftfeuchte (nicht im Winter).
//
// gute Infos zum Raumklima:
// https://www.energie-lexikon.info/luftfeuchtigkeit.html
// http://www.energiebuero-online.de/bauphysik/richtigluften.htm
 
// Autoren des Skripts:
// -----------------------------------------------------------------------------
// - Paul53:
//   Formeln, Idee, Experte im Bereich Raumklima, Korrekturen am gr. Skript
// - Solear:
//   Zusammenfassung der Skripte/Formeln von Paul53
// - ruhr70:
//   Ein Skript für alle vorhandenen Räume
// - eric 2905:
//   Optimierungen, viele neue Ideen, JSON-Ausgabe, globale Datenpunkte
// - Andy3268:
//   Hinzufügen der 4.ten Bedingung für Raumfeuchte Grenzwerte
// - BananaJoe:
//   Verzicht auf externes Modul "dewpoint"
// - boriswerner:
//   Nutzung 0_userdata, fix JSON String-handling
 
// https://forum.iobroker.net/topic/2313/skript-absolute-feuchte-berechnen/437 
// TODO:
// -----------------------------------------------------------------------------
//
// - Einstellungen Hysterese (Expertenmodus)
//
// - setState / getState, die es nicht gibt: Fehler abfangen und Warnung ausgeben, damit der Adapter sich nicht beendet
//
// - Luftdruck alternativ vom Messgerät und nicht über Skript (ggf. per Raum)
//
// - Auswählbar: Datenpunkte ohne Einheit (zusätzlich) erzeugen (z.B. für vis justgage, value & indicator)
//
// - Auswählbar:
//   Zweig Raum:    NICHT anlegen
//   JSON:          NICHT anlegen
//   DETAILS:       NICHT anlegen
//   CONTROL:       NICHT anlegen
//
// - JSON wird recht groß: ggf. Datenpunkte für JSON auswählbar machen
//
// - ggf. JSON nicht als String zusammenbauen, sondern als json-Objekt (dann JSON.stringify(json))
//
// - Zähler einbauen: Anzahl Räume in Hysterese (Grenzbereich)
//
// # "Lüftungsengine":
// -------------------
// - möglichst an die individuellen Situationen und Vorlieben anpassbar
// - differenziertere Lüftungsempfehlung
// - CO2, Luftgüte einbeziehen
// - Experteneinstellungen (welche Werte sind einem wichtig)
// - Modus mit Werten/Prioritäten (wie dringend muss gelüftet werden)
// - Kellerentlüftung einbauen (Raum markierbar als Keller)
// - Sommer / Winter (Heizperiode) berücksichtigen
// - dringend lüften, ab 70% rel. Luftfeuchtigkeit und geeigneter Außenluft (Vergl. absolute Luftfeuchtigkeit)
// - Massnahme: zu trockene Luft (rel. Luftfeuchtigkeit < 40%)
// - Massnahme: Luft rel. Feuch > 60% oder 65% (?)
// - Feuchtigkeitstrend berücksichtigen. Ist ie Tendenz fallend, Bedingung "Entfeuchten" überstimmen.
 
// Ideensammlung Lüftungsengine
// - zentraler Datenpunkt: Heizperiode
// - je Raum eine opt. Datenpunkt für eine zugeordnete Heizung (Zieltemperatur und Heizung an/aus)
// - je Raum die Wunschtemperatur
// - Prio: schlechte Luftqualität
// - Prio: kühlen, wenn Temperaturunterschied zu groß
// - Prio: zu trockene Luft (rel.)
// - Prio: zu feuchte Luft (rel.)
 
// berücksichtigen / Beobachtungen:
//
// wenn draussen zu kalt ist, macht das lüften tlw. keinen Sinn mehr
// wenn die Zimmertemperatur bis zum Minimum abkühlt kann torz Unterschid xi/xa
// xi und die rel. Luftfeuchte weiter steigen, da die dann kältere Raumluft weniger 
// Luftfeuchtigkeittragen kann.
 
// -----------------------------------------------------------------------------
// Einstellungen Skriptverhalten, eigene Parameter -  !! bitte anpassen !!
// -----------------------------------------------------------------------------
 
// Wichtig:                             // betrifft den CONTROL Zweig bei den Raumdatepunkten (Offsets, Raummindestemperatur (Auskühlschutz))
var skriptConf  = true;                 // Anwender kann sich aussuchen, ob er die Werte im Skript oder über die Objekte pflegen möchte
                                       // true:  Raumwerte werden über das Skript geändert/überschrieben (var raeume)
                                       // false: Raumwerte werden über Objekte (z.B. im Admin, Zustände oder VIS) geändert
 
var debug = false;                      // true: erweitertes Logging einschalten
 
 
// eigene Parameter:
var hunn            = 15;           // eigene Höhe über nn (normalnull), z.B. über http://de.mygeoposition.com zu ermitteln
var defaultTemp     = 18.00;     // Default TEMP_Minimum, wenn im Raum nicht angegeben (Auskühlschutz, tiefer soll eine Raumtemperatur durchs lüften nicht sinken)
var defaultMinFeu   = 40.00;     // Default Mindest Feuchte wenn nicht angegeben.
var defaultMaxFeu   = 60.00;     // Default Maximal Feuchte wenn nicht angegeben.
 
var cronStr         = "*/30 * * * *";       // Zeit, in der alle Räume aktualisiert werden (da auf Änderung der Sensoren aktualisiert wird, kann die Zeit sehr hoch sein)
var strDatum        = "DD-MM-JJJJ SS:mm:ss";// Format, in dem das Aktualisierungsdatum für das JSON ausgegeben wird
 
 
 
// ### Experteneinstellungen ###
 
// Lüftungsengine
 
var hysMinTemp      = 0.5;              // Default 0.5, Hysterese Mindesttemperatur (Auskühlschutz). Innerhalb dieser Deltatemperatur bleibt die alte Lüftungsempfehlung für den Auskühlschutz bestehen.
var hysEntfeuchten  = 0.3;              // Default 0.3, Hysterese Entfeuhten: Delta g/kG absolute Luftfeuchte. In dem Delta findet keine Änderung der alten Lüftungsempfehlung statt    
 
 
// Skriptverhalten
var delayRooms      = 500;              // Zeit in ms als Verzögerung, wie die Räume abgearbeitet werden
 
 
// Pfade für die Datenpunkte:
var pfad        = "0_userdata.0.Raumklima"   +".";   // Pfad unter dem die Datenpunkte in der Javascript-Instanz angelegt werden
 
// Unterpfade unterhalb des Hauptpfads
var raumPfad    = "Raum"        +".";   // Pfad unterhalb des Hauptpfads für die Räume
var controlPfad = "CONTROL"     +".";   // Pfad innerhalb des Raums für Kontrollparameter
var detailPfad  = "DETAILS"     +".";   // Pfad innerhalb des Raums für Detailparameter ("" und ohne ".", wenn kein Detailpfad gewünscht)
var detailEnginePfad = "DETAILS_Lüftungsempfehlung" + "."; // Pfad innerhalb des Raums für Detailparameter zur Lüftungsengine
 
var infoPfad    = "Skriptinfos" +".";   // Pfad für globale Skriptparameter zur Info
 

 // -----------------------------------------------------------------------------
 // Räume mit Sensoren, Parametrisierung -           !! bitte anpassen !!
 // -----------------------------------------------------------------------------
  
 // jeder Sensor darf nur einmal verwendet werden!
  
 // wird kein Aussensensor angegeben, wird der Sensor als Aussensensor behandelt!
  
 var raeume = { // Keine Leerzeichen (Name wird als Datenpunktname verwendet!)
     // Sensoren Aussen
     "Aussen" : {
         "Sensor_TEMP"           :   'zigbee.0.00158d0005446ec5.temperature' /*Aussensensor TEMPERATURE*/,
         "Sensor_HUM"            :   'zigbee.0.00158d0005446ec5.humidity'/*Aussensensor HUMIDITY*/,
         "Sensor_TEMP_OFFSET"    :   0,
         "Sensor_HUM_OFFSET"     :   0,
         "Sensor_PRESSURE"       :   'zigbee.0.00158d0005446ec5.pressure'
        
     },
     // Sensoren Innen
     "Wohnzimmer" : {
         "Sensor_TEMP"           :   'hm-rpc.0.000A97098ED69A.1.ACTUAL_TEMPERATURE' /*Balkon.TEMPERATURE*/,
         "Sensor_HUM"            :   'hm-rpc.0.000A97098ED69A.1.HUMIDITY' /*Balkon.HUMIDITY*/,
         "Sensor_TEMP_OFFSET"    :   0.0,
         "Sensor_HUM_OFFSET"     :   0,
         "TEMP_Minimum"          :   'hm-rpc.0.000A97098ED69A.1.SET_POINT_TEMPERATURE', // oder Zieltemperatur in Form von: 20.00 angeben
         "Aussensensor"          :   "Aussen"
     },
  
     // Sensoren Innen
     "Schlafzimmer" : {
         "Sensor_TEMP"           :   'hm-rpc.0.000E9569A23C4A.1.ACTUAL_TEMPERATURE' /*Badzimmer.TEMPERATURE*/,
         "Sensor_HUM"            :   'hm-rpc.0.000E9569A23C4A.1.HUMIDITY' /*Badzimmer.HUMIDITY*/,
         "Sensor_TEMP_OFFSET"    :   0.0,
         "Sensor_HUM_OFFSET"     :   0,
         "TEMP_Minimum"          :   19.50, // oder Zieltemperatur in Form von: 20.00 angeben
         "Aussensensor"          :   "Aussen"
     },
      
     // Sensoren Innen
     "Levio" : {
         "Sensor_TEMP"           :   'hm-rpc.0.000313C995523A.1.ACTUAL_TEMPERATURE' /*Badzimmer.TEMPERATURE*/,
         "Sensor_HUM"            :   'hm-rpc.0.000313C995523A.1.HUMIDITY' /*Badzimmer.HUMIDITY*/,
         "Sensor_TEMP_OFFSET"    :   0.0,
         "Sensor_HUM_OFFSET"     :   0,
         "TEMP_Minimum"          :   21.00, // oder Zieltemperatur in Form von: 20.00 angeben
         "Aussensensor"          :   "Aussen"
     },
      
     // Sensoren Innen
     "Alia" : {
         "Sensor_TEMP"           :   'hm-rpc.0.000E97099D2AF1.1.ACTUAL_TEMPERATURE' /*Badzimmer.TEMPERATURE*/,
         "Sensor_HUM"            :   'hm-rpc.0.000E97099D2AF1.1.HUMIDITY' /*Badzimmer.HUMIDITY*/,
         "Sensor_TEMP_OFFSET"    :   0.0,
         "Sensor_HUM_OFFSET"     :   0,
         "TEMP_Minimum"          :   21.00, // oder Zieltemperatur in Form von: 20.00 angeben
         "Aussensensor"          :   "Aussen"
     },
           
     // Sensoren Innen
     "Küche" : {
         "Sensor_TEMP"           :   'zigbee.0.00158d0005426c6a.temperature' /*Badzimmer.TEMPERATURE*/,
         "Sensor_HUM"            :   'zigbee.0.00158d0005426c6a.humidity' /*Badzimmer.HUMIDITY*/,
         "Sensor_TEMP_OFFSET"    :   0.0,
         "Sensor_HUM_OFFSET"     :   0,
         "TEMP_Minimum"          :   19.00, // oder Zieltemperatur in Form von: 20.00 angeben
         "Aussensensor"          :   "Aussen"
     },
 };
    
 // =============================================================================
  
 // =============================================================================
 // Skriptbereich. Ab hier muss nichts mehr eingestellt / verändert werden.
 // =============================================================================
  
 // =============================================================================

// Das Modul dewpoint - integriert, keine externe Abhängigkeit mehr
// Start Modul Dewpoint
// Calculation of absolute humidity x (in g water per kg dry air) and of dew point temperature (in �C)
var dewpoint = function(h) {
        var z = 1.0 - (0.0065 / 288.15) * h;
        // air pressure in hPa
        this.p = 1013.25 * Math.pow(z, 5.255);
        this.A = 6.112;
        }
dewpoint.prototype.Calc = function(t, rh) {
        t = parseFloat(t);
        var m = 17.62;
        var Tn = 243.12;
        if (t < 0.0) {
        m = 22.46;
        Tn = 272.62;
        }
 
        var     sd = this.A * Math.exp(m * t / (Tn + t));
        var d = sd * rh / 100.0;
 
    return {
       x: 621.98 * d /(this.p - d),
       dp: Tn * Math.log(d/this.A) / (m - Math.log(d/this.A))
        };
};
// Ende Modul Dewpoint
 
 
var idSkriptinfoBar         = pfad + infoPfad + "Luftdruck";
var idSkriptinfoHunn        = pfad + infoPfad + "Höhe_über_NN";
 
// forceCreation = true, damit bei geändert eigener Höhe im Konfigurationsbereich der Datenpunkt neu geschrieben wird
createState(idSkriptinfoBar, luftdruck(hunn), true, {
   name: 'mittlerer Luftdruck in bar',
   desc: 'mittlerer Luftdruck in bar, errechnet anhand der eigenen Höhe über NN',
   type: 'number',
   unit: 'bar',
   role: 'info'
});
 
createState(idSkriptinfoHunn, hunn, true, {
   name: 'Eigene Höhe über NN',
   desc: 'Eigene Höhe über NN (Normal Null), als Basis für den mittleren Luftdruck',
   type: 'number',
   unit: 'm',
   role: 'info'
});
 
 
var raumDatenpunkte = {
   "x" : {
       "DpName" : "Feuchtegehalt_Absolut",
       "init": 0,
       "dp": {
           "name": 'absoluter Feuchtegehalt',
           "desc": 'absoluter Feuchtegehalt, errechnet',
           "type": 'number',
           "role": 'value',
           "unit": 'g/kg'
       }
   },
   "rh" : {
       "DpName" : "relative_Luftfeuchtigkeit",
       "init": 0,
       "dp": {
           "name": 'gemessene relative Luftfeuchtigkeit (inkl. Offset)',
           "desc": 'relative Luftfeuchtigkeit, vom Sensor + Offset zum Ausgleich von Messungenauigkeiten des Geräts',
           "type": 'number',
           "role": 'value',
           "unit": '%'
       }
   },
   "dp" : {
       "DpName" : "Taupunkt",
       "init": 0,
       "dp": {
           "name": 'Taupunkt',
           "desc": 'Taupunkt. Temperatur von Wänden, Fenstern, usw. ab der sich die Feuchtigkeit niederschlägt.',
           "type": 'number',
           "role": 'value',
           "unit": '°C'
       }
   },
   "t" : {
       "DpName" : "Temperatur",
       "init": 0,
       "dp": {
           "name": 'gemessene Temperatur (inkl. Offset)',
           "desc": 'gemessene Temperatur vom Sensor zzgl. eines Offsets um Geräteungenauigkeiten auszugleichen',
           "type": 'number',
           "role": 'value',
           "unit": '°C'
       }
   },
   "h" : {
       "DpName" : detailPfad + "Enthalpie",
       "init": 0,
       "dp": {
           "name": 'Enthalpie',
           "desc": 'Enthalpie',
           "type": 'number',
           "role": 'value',
           "unit": 'kJ/kg'
       }
   },
   "sdd" : {
       "DpName" : detailPfad +"Sättigungsdampfdruck",
       "init": 0,
       "dp": {
           "name": 'Sättigungsdampfdruck',
           "desc": 'Sättigungsdampfdruck',
           "type": 'number',
           "role": 'value',
           "unit": 'hPa'
       }
   },
   "dd" : {
       "DpName" : detailPfad + "Dampfdruck",
       "init": 0,
       "dp": {
           "name": 'Dampfdruck',
           "desc": 'Dampfdruck',
           "type": 'number',
           "role": 'value',
           "unit": 'hPa'
       }
   },
   "rd" : {
       "DpName" : "Dampfgewicht",
       "init": 0,
       "dp": {
           "name": 'Dampfgewicht (Wassergehalt)',
           "desc": 'Dampfgewicht (Wassergehalt)',
           "type": 'number',
           "role": 'value',
           "unit": 'g/m³'
       }
   },
   "maxrd" : {
       "DpName" : detailPfad + "Dampfgewicht_maximal",
       "init": 0,
       "dp": {
           "name": 'max. Dampfgewicht (Wassergehalt)',
           "desc": 'max. Dampfgewicht (Wassergehalt) bei aktueller Temperatur',
           "type": 'number',
           "role": 'value',
           "unit": 'g/m³'
       }
   },
   "lüften" : {
       "DpName" : "Lüftungsempfehlung",
       //"init": false,
       "dp": {
           "name": 'Lüftungsempfehlung',
           "desc": 'Lüftungsempfehlung',
           "type": 'boolean',
           "role": 'value'
       }
   },
   "lüften_b1" : {
       "DpName" : detailEnginePfad + "Lüften_b1_Entfeuchten",
       //"init": false,
       "dp": {
           "name": 'Lüften Bedingung 1 entfeuchten',
           "desc": 'Lüften Bedingung 1 entfeuchten erfüllt',
           "type": 'boolean',
           "role": 'value'
       }
   },
   "lüften_b2" : {
       "DpName" : detailEnginePfad + "Lüften_b2_Kühlen",
       //"init": false,
       "dp": {
           "name": 'Lüften Bedingung 2 kühlen',
           "desc": 'Lüften Bedingung 2 kühlen erfüllt',
           "type": 'boolean',
           "role": 'value'
       }
   },
   "lüften_b3" : {
       "DpName" : detailEnginePfad + "Lüften_b3_Auskühlschutz",
       //"init": false,
       "dp": {
           "name": 'Lüften Bedingung 3 Auskühlschutz',
           "desc": 'Lüften Bedingung 3 Auskühlschutz erfüllt (Innentemperatur soll nicht unter Minimumteperatur fallen)',
           "type": 'boolean',
           "role": 'value'
       }
   },
   "lüften_b4" : {
       "DpName" : detailEnginePfad + "Lüften_b4_Raumfeuchte",
       //"init": false,
       "dp": {
           "name": 'Lüften Bedingung 4 Raumfeuchte',
           "desc": 'Lüften Bedingung 4 Raumfeuchte erfüllt',
           "type": 'boolean',
           "role": 'value'
       }
   },
   "lüften_Hysterese" : {
       "DpName" : detailEnginePfad + "Lüften_Hysterese",
       //"init": false,
       "dp": {
           "name": 'Logik im Bereich der Hysterese. Keine Änderung der bestehenden Lüftungsempfehlung.',
           "desc": 'Logik im Bereich der Hysterese. Keine Änderung der bestehenden Lüftungsempfehlung.',
           "type": 'boolean',
           "role": 'value'
       }
   },
   "lüften_Beschreibung" : {
       "DpName" : detailEnginePfad + "Lüftungsempfehlung_Beschreibung",
       "init": "",
       "dp": {
           "name": 'Lüftungsempfehlung beschreibender Text',
           "desc": 'Lüftungsempfehlung beschreibender Text',
           "type": 'string',
           "role": 'value'
       }
   }
};
 
   // #1 - Entfeuchten:    Außenluft ist mind. (hysEntfeuchten + 0,1) trockener als Innen
   // #2 - Kühlen:         Außentemperatur ist mindestens 0,6 Grad kühler als innen TODO: im Winter auch?
   // #3 - Auskühlschutz:  Innentemperatur ist höher als die Mindesttemperatur
 
 
var raumControl = {
   "Sensor_TEMP_OFFSET" : {
       "DpName" : "Sensor_TEMP_OFFSET",
       "init": 0,
       "dp": {
           "name": 'Offset Temperatur zum Sensormesswert (Ausgleich von Ungenauigkeiten)',
           "desc": 'Offset Temperatur zum Sensormesswert (Ausgleich von Ungenauigkeiten)',
           "type": 'number',
           "role": 'control.value',
           "unit": '°C'
       }
   },
   "Sensor_HUM_OFFSET" : {
       "DpName" : "Sensor_HUM_OFFSET",
       "init": 0,
       "dp": {
           "name": 'Offset Luftfeuchtigkeit zum Sensormesswert (Ausgleich von Ungenauigkeiten)',
           "desc": 'Offset Luftfeuchtigkeit zum Sensormesswert (Ausgleich von Ungenauigkeiten)',
           "type": 'number',
           "role": 'control.value',
           "unit": '%'
       }
   },
   "TEMP_Minimum" : {
       "DpName" : "TEMP_Minimum",
       "init": 0,
       "dp": {
           "name": 'Auskühlschutz Mindestraumtemperatur',
           "desc": 'Auskühlschutz Mindestraumtemperatur zum lüften',
           "type": 'number',
           "role": 'control.value',
           "unit": '°C'
       }
   },
   "FEUCH_Minimum" : {
       "DpName" : "FEUCH_Minimum",
       "init": 0,
       "dp": {
           "name": 'Mindest Rel. Raumfeuchte',
           "desc": 'Mindest Rel. Raumfeuchte zum lüften',
           "type": 'number',
           "role": 'control.value',
           "unit": '%'
       }
   },
   "FEUCH_Maximum" : {
       "DpName" : "FEUCH_Maximum",
       "init": 0,
       "dp": {
           "name": 'Maximal Rel. Raumfeuchte ',
           "desc": 'Maximal Rel. Raumfeuchte zum lüften',
           "type": 'number',
           "role": 'control.value',
           "unit": '%'
       }
   },
   "Aussensensor" : {
       "DpName" : "Aussensensor",
       "init": "",
       "dp": {
           "name": 'Aussensensor, der zum Vergleich genommen wird',
           "desc": 'Aussensensor, der zum Vergleich genommen wird',
           "type": 'string',
           "role": 'control.value'
       }
   }
};
 
 
// globale Skript-Variablen/Objekte
//------------------------------------------------------------------------------
 
var xdp     = new dewpoint(hunn);
 
var pbar    = luftdruck(hunn);          // individueller Luftdruck      in bar (eigene Höhe)
 
 
 
//------------------------------------------------------------------------------
// Funktionen
//------------------------------------------------------------------------------
 
function writeJson(json) {
   return JSON.stringify(json);
}
 
 
// prüft ob setObjects() für die Instanz zur Verfügung steht (true/false)
function checkEnableSetObject() { 
   var enableSetObject = getObject("system.adapter.javascript." + instance).native.enableSetObject;
   return enableSetObject;
}
 
 
function setChannelName(channelId,channelName){
   if(checkEnableSetObject()) { // wenn setObject nicht in der Instanz freigeschaltet ist, wird der Channel nicht angelegt
   // CHANNEL anlegen
       setObject("javascript." + instance + "." + channelId, {
           common: {
               name: channelName
           },
           type: 'channel'
       }, function(err) {
           if (err) logs('Cannot write object: ' + err,"error");
       });
   }
}
 
 
function lueftenDp(datenpunktID) {
   return (datenpunktID == "lüften") || (datenpunktID == "lüften_Beschreibung") || (datenpunktID == "lüften_b1") || (datenpunktID == "lüften_b2") || (datenpunktID == "lüften_b3") || (datenpunktID == "lüften_b4") || (datenpunktID ==  "lüften_Hysterese");
}
 
 
function createDp() {
   var name;
   var init;
   var forceCreation;
   var common;
   for (var raum in raeume) {
       for (var datenpunktID in raumDatenpunkte) {
           name = pfad + raumPfad + raum + "." + raumDatenpunkte[datenpunktID].DpName;
           init = raumDatenpunkte[datenpunktID].init;
           forceCreation = false; // Init der Datenpunkte wird nur beim ersten Star angelegt. Danach bleiben die Wert auch nach Skritpstart enthalten.
           common = raumDatenpunkte[datenpunktID].dp;
           
           if (lueftenDp(datenpunktID)) {
               if (!raeume[raum].Aussensensor) {
                   if (datenpunktID == "lüften") {
                       log(raum + ": kein Aussensensor angegeben.  ### Messpunkte werden als Aussensensoren behandelt. ###","info"); // Warnung ist im Log OK, wenn es sich um einen Außensensor handelt.
                       setChannelName(pfad + raumPfad + raum,"Aussensensor");
                   }
               } else {
                   createState(name, init , forceCreation, common);
                   if (debug) log("neuer Datenpunkt: " + name);
               }
           } else {
               createState(name, init , forceCreation, common);
               if (debug) log("neuer Datenpunkt: " + name);
           }
           
       }
       for (var control in raumControl) {
           name = pfad + raumPfad + raum + "." + controlPfad + raumControl[control].DpName;
           //init = raumControl[control].init;
           forceCreation = skriptConf;
           common = raumControl[control].dp;
           if (typeof raeume[raum][raumControl[control].DpName] !=="undefined") {
               init = raeume[raum][raumControl[control].DpName];
               if (typeof init === "string" && init !== "Aussen")init = getState(init).val;
               createState(name, init , forceCreation, common);
               var channelname = "Nur Info. Werte aus dem Skript zählen. Kann im Skript umgestellt werden.";
               if (!skriptConf) channelname = "Änderungen hier in den Objekten werden berechnet";
               setChannelName(pfad + raumPfad + raum + "." + controlPfad.substr(0, controlPfad.length-1),channelname);
           }
       }
   }
   
   //eric2905 Datenpunkt "Lüften" erzeugen
   // -------------------------------------------------------------------------
   createState(pfad + 'Lüften', false, {
    name: 'Muss irgendwo gelüftet werden',
    desc: 'Muss irgendwo gelüftet werden',
    type: 'boolean',
    unit: '',
    role: 'value'
   });
 
   createState(pfad + 'Lüften_Liste', "[]", {
    name: 'Liste der Räume in denen gelüftet werden muss',
    desc: 'Liste der Räume in denen gelüftet werden muss',
    type: 'string',
    unit: '',
    role: 'value'
   });
 
   // eric2905 Ende -----------------------------------------------------------
 
   //eric2905 Datenpunkt "JSON" erzeugen
   // -------------------------------------------------------------------------
   createState(pfad + 'JSON', "", {
    name: 'JSON-Ausgabe aller Werte',
    desc: 'JSON-Ausgabe aller Werte',
    type: 'string',
    unit: '',
    role: 'value'
   });
   // eric2905 Ende -----------------------------------------------------------
 
   //eric2905 Datenpunkt "Aktualsierung" erzeugen
   // -------------------------------------------------------------------------
   createState(pfad + 'Aktualsierung', "", {
    name: 'Aktualisierungszeitpunkt der JSON-Ausgabe',
    desc: 'Aktualisierungszeitpunkt der JSON-Ausgabe',
    type: 'string',
    unit: '',
    role: 'value'
   });
   // eric2905 Ende -----------------------------------------------------------
  
  
   //eric2905 Datenpunkt "countLueften" erzeugen
   // -------------------------------------------------------------------------
   createState(pfad + 'Lüften_Anzahl', 0, {
    name: 'Anzahl Lüftungsempfehlungen',
    desc: 'Anzahl Lüftungsempfehlungen',
    type: 'number',
    unit: '',
    role: 'value'
   });
   // eric2905 Ende -----------------------------------------------------------
 
   log("Datenpunkte angelegt");
}
 
 
// rundet einen Float auf eine bestimmte Anzahl Nachkommastellen
function runden(wert,stellen) {
   return Math.round(wert * Math.pow(10,stellen)) / Math.pow(10,stellen);
}
 
// berechnet den mittleren Luftdruck für eine Höhenangabe in NN 
function luftdruck(hunn) {
   var pnn         = 1013.25;                                  // Mittlerer Luftdruck          in hPa bei NN
   var p           = pnn - (hunn / 8.0);                       // individueller Luftdruck      in hPa (eigenen Höhe)
   return p / 1000;                                            // Luftdruck von hPa in bar umrechnen
}
 
// Color Boolean (farbige Ausgabe Boolean als String, z.B. für das Log)
function cob(boolean) { 
   var cobStr = (boolean) ? '<span style="color:lime;"><b>true</b></span>' : '<span style="color:red;"><b>false</b></span>';
   return cobStr;
}
 
function makeNumber(wert) {
   if(isNaN(wert)) {
       wert = parseFloat(wert.match(/\d+[.|,]?\d+/g));
   }
   return wert;
}
 
 
 
// Berechnungen Luftwerte 
// ----------------------
 
function calcSaettigungsdampfdruck(t) {    // benötigt die aktuelle Temperatur
   // Quelle: http://www.wetterochs.de/wetter/feuchte.html#f1
   var sdd,a,b;
   a = 7.5;
   b = 237.3;
   sdd = 6.1078 * Math.pow(10,((a*t)/(b+t)));
   return sdd; // ssd = Sättigungsdampfdruck in hPa
}
 
function calcDampfdruck(sdd,r) {
   // Quelle: http://www.wetterochs.de/wetter/feuchte.html#f1
   var dd = r/100 *sdd;
   return dd;  // dd = Dampfdruck in hPa
}
 
function calcTemperaturKelvin(t) {
   var tk = t + 273.15;
   return tk;
}
 
function calcDampfgewicht(dd,t) { // Wassergehalt
   // Dampfgewicht rd oder AF(r,TK) = 10^5 * mw/R* * DD(r,T)/TK
   // Quelle: http://www.wetterochs.de/wetter/feuchte.html#f1
   var tk = calcTemperaturKelvin(t);
   var mw = 18.016; // kg/kmol (Molekulargewicht des Wasserdampfes)
   var R  = 8314.3; // J/(kmol*K) (universelle Gaskonstante)
   var rd = Math.pow(10,5) * mw/R * dd/tk; 
   return rd; // rd = Dampfgewicht in g/m^3
}
 
function calcMaxDampfgewicht(rd,r) {
   var maxrd = rd / r *100;
   return maxrd;
}
 
 
 
 
// Berechnung: alle Werte je Raum
// -------------------------------
 
 
function calc(raum) {                                           // Über Modul Dewpoint absolute Feuchte berechnen
 
   var t           = getState(raeume[raum].Sensor_TEMP).val;   // Temperatur auslesen
   var rh          = getState(raeume[raum].Sensor_HUM).val;    // Feuchtigkeit relativ auslesen
 
   t   = makeNumber(t);                                        // Temperatur in Number umwandeln
   rh  = makeNumber(rh);                                       // relative Luftfeuchtigkeit in Number umwandeln
 
   var toffset     = 0.0;                                      // Default Offset in °C
   var rhoffset    = 0;                                        // Default Offset in %
   if(typeof raeume[raum].Sensor_TEMP_OFFSET !=="undefined") {
       // Temperatur, wenn ein Offset vorhanden ist, diesen auslesen und Default überschreiben
       var idtoffset = pfad + raumPfad+ raum + "." + controlPfad + "Sensor_TEMP_OFFSET";
       toffset = getState(idtoffset).val;  // Offset aus den Objekten/Datenpunkt auslesen
   }
   if(typeof raeume[raum].Sensor_HUM_OFFSET !=="undefined") {
       // Luftfeuchtigkeit, wenn ein Offset vorhanden ist, diesen auslesen und Default überschreiben
       var idrhoffset = pfad + raumPfad + raum + "." + controlPfad + "Sensor_HUM_OFFSET";
       rhoffset = getState(idrhoffset).val;  // Offset aus den Objekten/Datenpunkt auslesen
   }
 
   t       = t     + toffset;      // Messwertanpassung: gemessene Temperatur um den Offset ergänzen
   rh      = rh    + rhoffset;     // Messwertanpassung: gemessene relative Luftfeuchtigkeit um Offset ergänzen
 
   var y           = xdp.Calc(t, rh);
   var x   = y.x;  // Zu errechnende Variable für Feuchtegehalt in g/kg
   var dp  = y.dp; // Zu errechnende Variable für Taupunkt in °C
 
   var h       = 1.00545 * t + (2.500827 + 0.00185894 * t) * x;    // Enthalpie in kJ/kg berechnen
 
   var sdd     = calcSaettigungsdampfdruck(t);                     // Sättigungsdampfdruck in hPa
   var dd      = calcDampfdruck(sdd,rh);                           // dd = Dampfdruck in hPa
   var rd      = calcDampfgewicht(dd,t);                           // rd = Dampfgewicht/Wassergehalt in g/m^3
   var maxrd   = calcMaxDampfgewicht(rd,rh);                       // maximales Dampfgewicht in g/m^3
   
 
   var idx     = pfad + raumPfad + raum + "." + raumDatenpunkte["x"].DpName;   // DP-ID absolute Luftfeuchte in g/kg
   var iddp    = pfad + raumPfad + raum + "." + raumDatenpunkte["dp"].DpName;  // DP-ID Taupunkt in °C
   var idt     = pfad + raumPfad + raum + "." + raumDatenpunkte["t"].DpName;   // DP-ID Temperatur inkl. Offset
   var idrh    = pfad + raumPfad + raum + "." + raumDatenpunkte["rh"].DpName;  // DP-ID relative Luftfeuhtigkeit inkl. Offset
   var ih      = pfad + raumPfad + raum + "." + raumDatenpunkte["h"].DpName;   // DP-ID Enthalpie in kJ/kg
   var isdd    = pfad + raumPfad + raum + "." + raumDatenpunkte["sdd"].DpName;
   var idd     = pfad + raumPfad + raum + "." + raumDatenpunkte["dd"].DpName;
   var ird     = pfad + raumPfad + raum + "." + raumDatenpunkte["rd"].DpName;
   var imaxrd  = pfad + raumPfad + raum + "." + raumDatenpunkte["maxrd"].DpName;
 
 
   setState(idx    , runden(x,2));     // errechnete absolute Feuchte in Datenpunkt schreiben
   setState(iddp   , runden(dp,1));    // errechneter Taupunkt in Datenpunkt schreiben
   setState(idt    , parseFloat(t));   // Sensor Temperatur        inkl. Offset
   setState(idrh   , parseFloat(rh));   // Sensor Relative Feuchte  inkl. Offset
   setState(ih     , runden(h,2));     // Enthalpie in kJ/kg
   setState(isdd   , runden(sdd,2));
   setState(idd    , runden(dd,2));
   setState(ird    , runden(rd,2));
   setState(imaxrd , runden(maxrd,2));
 
 
   // Logik-Engine: Lüftungsempfehlung berechnen
   // -------------------------------------------------------------------------
   if (!raeume[raum].Aussensensor) {
       // kein Aussensensor, keine Lüftungsempfehlung
       if (debug) log("<b>------ " + raum + " ------- Aussen, keine Lüftungsempfehlung -----------</b>");
       return; 
   }
   
   var aussen;
   var idta, idxa;
   if(typeof raeume[raum].Aussensensor !=="undefined") {
       aussen = raeume[raum].Aussensensor; // aussen = "Raumname" des zugehörigen Aussensensors
       idta = pfad + raumPfad + aussen + "." + raumDatenpunkte["t"].DpName;    // DP-ID zugehöriger Aussensensor, Temperatur aussen
       idxa = pfad + raumPfad + aussen + "." + raumDatenpunkte["x"].DpName;    // DP-ID zugehöriger Aussensensor, Luftfeuchtigkeit aussen
   } else {
       return; // wenn es keinen zugehörigen Aussensensor gibt, Funktion beenden (dann muss kein Vergleich berechnet werden)
   }
 
   var ti = t;                     // Raumtemperatur in °C
   var xi = runden(x,2);           // Raumfeuchtegehalt in g/kg
   var ta = getState(idta).val;    // Aussentemperatur in °C
   var xa = getState(idxa).val;    // Aussenfeuchtegehalt in g/kg
   if (xa == 0) return;            // TODO: warum? hatte ich leider nciht dokumentiert (ruhr70)
 
   var mi = defaultTemp;           // Temperaturmindestwert auf Default (Auskühlschutz)
   var xh = defaultMaxFeu;         // Feuchtemaximalwert auf Default
   var xt = defaultMinFeu;         // Feuchteminimalwert auf Default
	  
   //if(typeof raeume[raum].TEMP_Minimum !=="undefined") {
   if(typeof raeume[raum].TEMP_Minimum == "number") {
       mi = raeume[raum].TEMP_Minimum;
   }
   if(typeof raeume[raum].TEMP_Minimum == "string") {
       mi = getState(raeume[raum].TEMP_Minimum).val;
   }
   if(typeof raeume[raum].FEUCH_Maximum == "number") {
       xh = raeume[raum].FEUCH_Maximum;
   }
 
   if(typeof raeume[raum].FEUCH_Minimum == "number") {
       xt = raeume[raum].FEUCH_Minimum;
   }
   
   // Auskühlschutz,  hysMinTemp (Variable) Grad hysMinTemp Hysterese. Tiefer darf die Innentemperatur nicht sinken
   var mih = mi + hysMinTemp;      // Temperaturmindestwert hoch (Mindesttemperatur plus Hysterese)
   var mit = mi;                   // Temperaturmindestwert tief
 
   var idLueften       = pfad + raumPfad + raum + "." + raumDatenpunkte["lüften"].DpName;
   var idLueftenText   = pfad + raumPfad + raum + "." + raumDatenpunkte["lüften_Beschreibung"].DpName;
   var idLueftenB1     = pfad + raumPfad + raum + "." + raumDatenpunkte["lüften_b1"].DpName;
   var idLueftenB2     = pfad + raumPfad + raum + "." + raumDatenpunkte["lüften_b2"].DpName;
   var idLueftenB3     = pfad + raumPfad + raum + "." + raumDatenpunkte["lüften_b3"].DpName;
   var idLueftenB4     = pfad + raumPfad + raum + "." + raumDatenpunkte["lüften_b4"].DpName;
   var idLueftenHys    = pfad + raumPfad + raum + "." + raumDatenpunkte["lüften_Hysterese"].DpName;
 
   var lueftenText     = "";
 
 
 
   // Lüftungslogik
   // -------------
   // Lüftungsempfehlung steuern mit 0,3 g/kg und 0,5 K Hysterese
   // Bedigungen fürs lüften
   var b1lp = (xa <= (xi - (hysEntfeuchten + 0.1)))    ? true : false;   // Bedingnung 1 lüften positv (Außenluft ist mind. 0,4 trockener als Innen)
   var b2lp = (ta <= (ti - 0.6))                       ? true : false;   // Bedingnung 2 lüften positv (Außentemperatur ist mindestens 0,6 Grad kühler als innen)
   var b3lp = (ti >= mih)                              ? true : false;   // Bedingnung 3 lüften positv (Innentemperatur ist höher als die Minimumtemperatur + Hysterese)
   var b4lp = (rh >= xh)                               ? true : false;   // Bedingnung 4 lüften positv (Relative Raumfeuchte ist höher als die Maximalfeuchtewert)
 
   var b1lpText = "Entfeuchten:    Außenluft ist mind. 0,4 trockener als Innen";
   var b2lpText = "Kühlen:         Außentemperatur ist mindestens 0,6 Grad kühler als innen";
   var b3lpText = "Auskühlschutz:  Innentemperatur ist höher als die Mindesttemperatur";
   var b4lpText = "Raumfeuchte:    Raumfeuchte ist höher als der Maximalfeuchte";
 
   setState(idLueftenB1,b1lp);
   setState(idLueftenB2,b2lp);
   setState(idLueftenB3,b3lp);
   setState(idLueftenB4,b4lp);
 
   // Bedingungen gegen das Lüften
   var b1ln = (xa >= (xi - 0.1))   ? true : false;   // Bedingnung 1 lüften negativ (Außenluft ist zu feucht)
   var b2ln = (ta >= (ti - 0.1))   ? true : false;   // Bedingnung 2 lüften negativ (Außentemperatur zu warm)
   var b3ln = (ti <= mit)          ? true : false;   // Bedingnung 3 lüften negativ (Innentemperatur niedriger als Mindesttemperatur)
   var b4ln = (rh <= xt)           ? true : false;   // Bedingnung 4 lüften negativ (Relative Raumfeuchte ist niedriger als die Mindestfeuchte)
 
   var b1lnText = "Außenluft ist zu feucht";
   var b2lnText = "Außentemperatur zu warm";
   var b3lnText = "Raum ist zu kalt";
   var b4lnText = "Raumfeuchte ist zu niedrig";
 
   
   // Logik:
   //--------------------------------------------------------------------------
   if (b1lp && b2lp && b3lp && b4lp) {
       // Lüftungsempfehlung, alle Bedingungenen erfüllt
       lueftenText = "Bedingungen für Entfeuchten, Kühlen und Auskühlschutz erfüllt.";
       setState(idLueften, true);
       setState(idLueftenHys,false);
 
       if (debug) log(raum + ': <span style="color:limegreen;"><b>Lüftungsempfehlung</b></span>');
 
   } else if (b1ln || b2ln || b3ln || b4ln) {
       // Fenster zu. Ein Ausschlusskriterium reicht für die Empfehlung "Fenster zu".
       lueftenText = "Fenster zu: ";
       if (b1ln) lueftenText += b1lnText; 
       if (b1ln && b2ln) lueftenText += ", " ;
       if (b2ln) lueftenText += b2lnText; 
       if (b2ln && b3ln) lueftenText += ", "  ;
       if (b3ln) lueftenText += b3lnText;
       if (b4ln) lueftenText += ", " ;
	   if (b4ln) lueftenText += b4lnText;
       setState(idLueften, false);
       setState(idLueftenHys,false);
       if (debug) log(raum + ': <span style="color:red;"><b>Empfehlung Fenster zu</b></span>');
   } else {
       // Hysterese. Keine Änderung der bisherigen Empfehlung.
       if (debug) log(raum + ': <span style="color:orange;"><b>im Bereich der Hysterese</b></span> (keine Änderung der Lüftungsempfehlung');
       if (getState(idLueften).val === null) setState(idLueften,false); // noch keine Empfehlung vorhanden, "Fenster zu" empfehlen
       lueftenText = "Hysterese, keine Änderung der Lüftungsempfehlung:";
       setState(idLueftenHys,true);
   }
   setState(idLueftenText, lueftenText);
 
 
   /* Erklärung Lüftungslogik (von Paul53)
      Ergänzung #4 (von Andy3268)
   Lüften:
   wenn    abs. Aussenfeuchte  <   abs. Innenfeuchte     - Hysterese (Entfeuchten)
   UND     Aussentemperatur    <   Innentemperatur       - Hysterese (Kühlen)
   UND     Innentemperatur     >=  Raumtemperaturminimum + Hysterese (Auskühlschutz)
   UND     Innenfeuchte        >=  Raummaximalfechte
   */
 
   // lüften (und - Alle Bedingungen müssen erfüllt sein):
   // #1 - Entfeuchten:    Außenluft ist mind. (hysEntfeuchten + 0,1) trockener als Innen
   // #2 - Kühlen:         Außentemperatur ist mindestens 0,6 Grad kühler als innen TODO: im Winter auch?
   // #3 - Auskühlschutz:  Innentemperatur ist höher als die Mindesttemperatur
   // #4 - Raumfeuchte:    Innenfeuchte ist höher als die Maximalfeuchte
 
   // nicht lüften (oder):
   // #1 - Außenluft ist zu feucht
   // #2 - Außentemperatur zu warm
   // #3 - Innentemperatur niedriger als Mindestraumtemperatur
   // #4 - Innenfeuchte niedriger als Mindestfeuchte
 
   if (debug) log(raum + ":" + cob(b4ln) + " Raumluft ist zu trocken (b4ln): ");
   if (debug) log(raum + ":" + cob(b3ln) + " Raumtemperatur ist zu niedrig (b3ln): ");
   if (debug) log(raum + ":" + cob(b2ln) + " Außentemperatur ist zu hoch (b2ln): ");
   if (debug) log(raum + ":" + cob(b1ln) + " Außenluft ist zu feucht (b1ln): " + ": xa: " + xa + " >= (xi - 0.1) " + (xi - 0.1));
   if (debug) log(raum + ": Fenster zu (ein true reicht):");
   
   //if (debug) log(raum + ": b1lp: " + b1lp+ ", b2lp: " + b2lp+ ", b3lp: " + b3lp, b4lp: " + b4lp);
   if (debug) log(raum + ":" + cob(b4lp) + " Raumfeuchte ist hoch genug (b4lp): "); 
   if (debug) log(raum + ":" + cob(b3lp) + " Innentemperatur ist höher als die Mindesttemperatur (b3lp): ");
   if (debug) log(raum + ":" + cob(b2lp) + " Außentemperatur ist mindestens 0,6 Grad kühler als innen (b2lp): ");
   if (debug) log(raum + ":" + cob(b1lp) + " Außenluft ist mind. 0,4 g/kg trockener als innen (b1lp):  xa: " + xa + " <= (xi - 0.4) " + (xi - 0.4));
   if (debug) log(raum + ": Lüftungsempfehlung (alle Bedingungen auf true):");
 
   if (debug) log(raum + ", ti:"+ti+", ta: "+ta+", xi:"+xi+", xa: "+xa+", mih:"+mih+", mit:"+mit,"info");
   if (debug) log("<b>------ " + raum + " ------- Aussensensor: " + aussen + " -----------</b>");
}
 
 
 
 
 
//eric2905 Erzeuge JSON und setzen Variablen "anyLueften" und "countLueften"
// -----------------------------------------------------------------------------
function createJSON() {
   // alle Daten im JSON werden als String abgelegt
   if (debug) log("=========================================================");
   if (debug) log("Erzeugung JSON Start");
   if (debug) log("=========================================================");
 
   var anyLueften          = false;
   var countLueften        = 0;
   var raeumeLueftenListe  = [];
   
   var temppfad = "";
   var tempraum = "";
   var tempVal = "";
   var strJSONfinal = "[";
   var strJSONtemp = "";
 
   for (var raum in raeume) {
       strJSONtemp = strJSONtemp + "{";
       strJSONtemp = strJSONtemp + "\"Raum\":\"" + raum + "\",";
 
       for (var datenpunktID in raumDatenpunkte) {
           
           // Aussensensor ja oder nein 
           var aussensensor = false;
           if (lueftenDp(datenpunktID)) {
               if (!raeume[raum].Aussensensor) {
                   aussensensor = true;
               }
           }
           
           temppfad = pfad + raumPfad + raum + "." + raumDatenpunkte[datenpunktID].DpName;
           tempraum = pfad + raumPfad + raum;
 
           tempVal = (!aussensensor ? getState(temppfad).val : "");            // kein Aussensenosr: Lüftungsempfehlung auslesen, Aussensensor: Lüftungsempfehlung freilassen
           if (tempVal === null) tempVal = "";
           if(raumDatenpunkte[datenpunktID].DpName != "Lüftungsempfehlung") {
               if(!isNaN(tempVal)) {
                    tempVal = parseFloat(tempVal);
                    tempVal = tempVal.toFixed(2);
               }
           } else {
               if (tempVal === true) {
                   anyLueften = true;
                   countLueften = countLueften + 1;
                   raeumeLueftenListe.push(raum);
               }
           }
           strJSONtemp = strJSONtemp + "\"" + raumDatenpunkte[datenpunktID].DpName + "\":\"" + tempVal + "\",";
           
       }
       strJSONtemp = strJSONtemp.substr(0, strJSONtemp.length - 1);
       strJSONtemp = strJSONtemp + "},";
 
   }
 
   strJSONtemp = strJSONtemp.substr(0, strJSONtemp.length - 1);
   strJSONfinal = strJSONfinal + strJSONtemp + "]";
   if (debug) log("strJSONfinal = " + strJSONfinal);
   if (debug) log("anyLueften = " + anyLueften + ", Anzahl Lüftungsempfehlungen: " + countLueften);
   
   
   setState(pfad + 'Lüften'                    , anyLueften);
   setState(pfad + 'Lüften_Liste'              , writeJson(raeumeLueftenListe));
   setState(pfad + 'Lüften_Anzahl'             , countLueften);
   setState(pfad + 'JSON'                      , strJSONfinal);
   setState(pfad + 'Aktualsierung'             , formatDate(new Date(), strDatum));
   
   if (debug) log("=========================================================");
   if (debug) log("Erzeugung JSON Ende");
   if (debug) log("=========================================================");
}
// eric2905 Ende ---------------------------------------------------------------
 
 
 
 
function calcDelayed(raum, delay) {
   setTimeout(function () {
       calc(raum);
   }, delay || 0);
}
 
function creatJSONDelayed() {
   setTimeout(function () {
       createJSON();
   }, 4000); 
}
 
// Klimadaten in allen Räumen berechnen 
function calcAll() {
   for (var raum in raeume) {
       calcDelayed(raum,delayRooms);       // Räume verzögerd nacheinander abarbeiten
   }
}
 
 
// finde anhand der Sensor ID einen zugeordneten Raum
function findRoom(sensor) {
   for (var raum in raeume) {
       if (raeume[raum].Sensor_TEMP == sensor) return raum;
       if (raeume[raum].Sensor_HUM == sensor) return raum;
   }
   return null;
}
 
// Änderung eines Sensors (Temperatur oder Luftfeuchtigkeit)
function valChange(obj) {
   var raumname = findRoom(obj.id);
   if (raumname) {
       if (debug) log('<span style="color:black;"><b>Änderung:' + raumname + ": " + obj.id + ": " + obj.state.val + '</b></span>');
       calcDelayed(raumname,delayRooms);
   }
   // eric2905 Aufruf eingebaut zum JSON erzeugen und Datenpunkt befüllen
   // -----------------------------------------------------------------------------
   creatJSONDelayed();
   // eric2905 Ende ---------------------------------------------------------------
}
 
 
// Datenpunkte für alle Räume anlegen
function createOn() {
   var dpId    = "";
 
   // TODO: Im Modus CONTROL über Objekte: Bei Änderung der OFFSETS, Temperatur_Minimum werden die Änderung erst nach Aktualisierung der Messwerte oder nach Zeit erneuert (auf on() reagieren) 
   var i =0;
 
   for (var raum in raeume) {
       
       if (raeume[raum].Sensor_TEMP) {
           dpId = raeume[raum].Sensor_TEMP;
           i++;
           on({id: dpId ,change:'ne'}, function (obj) {
               valChange(obj);
           });
           if (debug) log("on: " + dpId + " angelegt.");
       }
 
       if (raeume[raum].Sensor_HUM) {
           dpId = raeume[raum].Sensor_HUM;
           i++;
           on({id: dpId ,change:'ne'}, function (obj) {
               valChange(obj)
           });
           if (debug) log("on: " + dpId + " angelegt.");
       }

       if (raeume[raum].TEMP_Minimum) {
           dpId = raeume[raum].TEMP_Minimum;
           i++;
           if(typeof dpId !== "number"){
                on({id: dpId ,change:'ne'}, function (obj) {
                    valChange(obj)
                });
                if (debug) log("on: " + dpId + " angelegt.");
           }
       }
   }
   log("Subscriptions angelegt: " + i);
}
 
 
 
// Schedule
// =============================================================================
 
// Nach Zeit alle Räume abfragen
schedule(cronStr, function () {
   calcAll();
   // eric2905 Aufruf eingebaut zum JSON erzeugen und Datenpunkt befüllen
   creatJSONDelayed();
   // eric2905 Ende ---------------------------------------------------------------
});
 
 
// main()
// =============================================================================
 
function main() {
   calcAll();
   setTimeout(calcAll,2000);
   // eric2905 Aufruf eingebaut zum JSON erzeugen und Datenpunkt befüllen
   creatJSONDelayed();
   // eric2905 Ende ---------------------------------------------------------------
}
 
 
// Skriptstart
// =============================================================================
 
createDp();                 // Datenpunkte anlegen
setTimeout(createOn,2000);  // Subscriptions anlegen
setTimeout(main,    4000);  // Zum Skriptstart ausführen
 
