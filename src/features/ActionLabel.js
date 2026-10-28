import React from 'react';
import {View,Text} from 'react-native';
import {SunriseIcon} from '../components/SunriseUI';
import {featureStyles as s} from './ui';
export default function ActionLabel({icon,children,primary=false}) {
  return <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}}>
    <SunriseIcon name={icon} size={18} color={primary?'#FFFFFF':'#217F77'}/>
    {children != null && <Text style={[primary?s.buttonText:s.secondaryText,{flexShrink:1}]}>{children}</Text>}
  </View>;
}
