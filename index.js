import React from 'react';
import {AppSurface} from './src/components/AppModal';
import { AppRegistry } from 'react-native';

import App from './App';

const Root = () => <AppSurface><App/></AppSurface>;
AppRegistry.registerComponent('main', () => Root);

